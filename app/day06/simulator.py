"""Monte-carlo simulator for three income structures.

Educational, stylized models — not exact replicas of any real-world scheme.
Pure Python, deterministic given seed. No numpy (kept out of requirements to
stay under PythonAnywhere free-tier disk quota).

Qualitative invariants the simulator must preserve:
1. Ponzi: collapse is mathematically inevitable when growth slows below the
   pace required to cover promised returns. Operator profits; participants lose.
2. Pyramid: geometric recruitment requirements exhaust the population. Late
   joiners can't recruit anyone. The majority lose.
3. MLM (legal): real product, real markups — but forced monthly inventory
   costs combined with Gaussian sales mean the median participant loses money.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional

StructureType = Literal["ponzi", "pyramid", "mlm"]


@dataclass
class ParticipantOutcome:
    invested: float
    received: float
    net: float
    is_operator: bool
    is_early: bool
    joined_at_month: int


@dataclass
class TrialResult:
    structure: StructureType
    months_run: int
    total_participants: int
    total_invested: float
    total_paid_out: float
    operator_net: float
    participants: List[ParticipantOutcome] = field(default_factory=list)
    collapsed: bool = False
    collapse_month: Optional[int] = None
    timeline: List[Dict[str, float]] = field(default_factory=list)


# ===== Preset configurations =====

PRESETS: Dict[str, Dict[str, Any]] = {
    "ponzi_classic": {
        "name": "Classic Ponzi — Sustainable Promise",
        "structure": "ponzi",
        "structure_label": "PONZI",
        "description": (
            "An operator promises consistent monthly returns with no real "
            "revenue source. Returns are paid from new investors' capital."
        ),
        "params": {
            "months_horizon": 24,
            "starting_participants": 10,
            "monthly_growth_rate": 0.45,
            "promised_return_pct": 0.10,
            "investment_per_person": 1000,
            "growth_decay_per_month": 0.035,
            "collapse_threshold_abs": 0.10,
        },
        "explanation": (
            "When promised returns exceed sustainable recruitment growth, "
            "collapse is mathematically inevitable. The only question is "
            "when — and how many people get caught when it does."
        ),
    },
    "pyramid_5x10": {
        "name": "Pyramid — 5-Level Recruitment",
        "structure": "pyramid",
        "structure_label": "PYRAMID",
        "description": (
            "Each participant must recruit 5 people to break even. The "
            "structure aims to reach 10 levels deep."
        ),
        "params": {
            "months_horizon": 36,
            "starting_participants": 5,
            "downline_requirement": 5,
            "entry_fee": 500,
            "recruiter_share": 0.30,
            "monthly_recruit_mean": 0.35,
            "monthly_recruit_stdev": 0.45,
            "population_cap": 4000,
            "saturation_exp": 0.8,
        },
        "explanation": (
            "5 levels deep requires 5^5 = 3,125 people. 10 levels requires "
            "5^10 ≈ 9.7 million. The structure mathematically runs out of "
            "population. The earlier you join, the more likely you profit — "
            "but most people, by definition, join late."
        ),
    },
    "mlm_realistic": {
        "name": "MLM — Realistic Product Sales",
        "structure": "mlm",
        "structure_label": "MLM",
        "description": (
            "Participants buy product at wholesale, sell at retail markup, "
            "earn a 5% commission on downline sales."
        ),
        "params": {
            "months_horizon": 24,
            "starting_participants": 25,
            "wholesale_cost": 200,
            "retail_markup": 0.40,
            "monthly_inventory_required": 170,
            "downline_commission_rate": 0.05,
            "avg_monthly_sales_per_participant": 380,
            "sales_stdev": 260,
            "monthly_growth_rate": 0.08,
            "dropout_per_month": 0.05,
        },
        "explanation": (
            "Real product, real markups — but most participants sell only "
            "modestly while paying monthly inventory costs. Published industry "
            "data consistently shows the median MLM participant earns less "
            "than they spend."
        ),
    },
    "pyramid_slow": {
        "name": "Pyramid — Slow Recruitment",
        "structure": "pyramid",
        "structure_label": "PYRAMID",
        "description": (
            "A pyramid scheme with modest promised growth — but the structure "
            "is the same."
        ),
        "params": {
            "months_horizon": 48,
            "starting_participants": 5,
            "downline_requirement": 3,
            "entry_fee": 300,
            "recruiter_share": 0.30,
            "monthly_recruit_mean": 0.18,
            "monthly_recruit_stdev": 0.30,
            "population_cap": 3000,
            "saturation_exp": 0.8,
        },
        "explanation": (
            "Slower recruitment doesn't fix the problem — it just delays the "
            "same outcome. The math of exponential recruitment requirements "
            "is unforgiving even at modest growth rates."
        ),
    },
    "mlm_aggressive": {
        "name": "MLM — Aggressive Promotion",
        "structure": "mlm",
        "structure_label": "MLM",
        "description": (
            "MLM with overpriced product and high inventory requirements. "
            "Income depends heavily on downline."
        ),
        "params": {
            "months_horizon": 24,
            "starting_participants": 25,
            "wholesale_cost": 500,
            "retail_markup": 0.20,
            "monthly_inventory_required": 480,
            "downline_commission_rate": 0.10,
            "avg_monthly_sales_per_participant": 280,
            "sales_stdev": 220,
            "monthly_growth_rate": 0.18,
            "dropout_per_month": 0.05,
        },
        "explanation": (
            "When the product is overpriced and the income depends heavily on "
            "recruiting, the structure becomes legally permissible but "
            "mathematically resembles a pyramid. The FTC distinguishes legal "
            "MLM from pyramid by intent and the ratio of product sales to "
            "downline income."
        ),
    },
}


def list_presets() -> List[Dict[str, str]]:
    return [
        {
            "id": key,
            "name": p["name"],
            "structure": p["structure"],
            "structure_label": p["structure_label"],
            "description": p["description"],
        }
        for key, p in PRESETS.items()
    ]


def get_preset(preset_id: str) -> Optional[Dict[str, Any]]:
    return PRESETS.get(preset_id)


# ===== Simulation engines =====

def simulate_ponzi(params: Dict[str, Any], seed: int) -> TrialResult:
    rng = random.Random(seed)

    months = int(params["months_horizon"])
    starting = int(params["starting_participants"])
    growth = float(params["monthly_growth_rate"])
    promised_return = float(params["promised_return_pct"])
    investment = float(params["investment_per_person"])
    growth_decay = float(params["growth_decay_per_month"])
    collapse_abs = float(params["collapse_threshold_abs"])

    participants: List[ParticipantOutcome] = []
    operator_pocket = 0.0
    total_invested = 0.0
    total_paid_out = 0.0
    collapse_month: Optional[int] = None
    timeline: List[Dict[str, float]] = []

    for _ in range(starting):
        participants.append(ParticipantOutcome(
            invested=investment, received=0.0, net=-investment,
            is_operator=False, is_early=True, joined_at_month=0,
        ))
    total_invested += starting * investment
    operator_pocket += starting * investment

    timeline.append({
        "month": 0,
        "invested": total_invested,
        "paid_out": total_paid_out,
        "participants": float(len(participants)),
    })

    current_growth = growth

    for month in range(1, months + 1):
        # Decay growth, with a small noise term
        noise = rng.uniform(-0.15, 0.15)
        current_growth = max(0.0, current_growth - growth_decay * (1 + noise))

        if current_growth < collapse_abs:
            collapse_month = month
            break

        new_count = max(0, int(round(len(participants) * current_growth)))
        for _ in range(new_count):
            participants.append(ParticipantOutcome(
                invested=investment, received=0.0, net=-investment,
                is_operator=False,
                is_early=((month / months) < 0.2),
                joined_at_month=month,
            ))
        total_invested += new_count * investment
        operator_pocket += new_count * investment

        # Pay promised returns to anyone who joined in a prior month and is still owed
        for p in participants:
            if p.joined_at_month < month and not p.is_operator:
                payout = p.invested * promised_return
                if operator_pocket >= payout:
                    p.received += payout
                    p.net = p.received - p.invested
                    operator_pocket -= payout
                    total_paid_out += payout
                else:
                    # Operator can't fully pay → trigger collapse
                    collapse_month = month
                    break
        if collapse_month is not None:
            break

        timeline.append({
            "month": month,
            "invested": total_invested,
            "paid_out": total_paid_out,
            "participants": float(len(participants)),
        })

    operator_net = operator_pocket

    return TrialResult(
        structure="ponzi",
        months_run=collapse_month or months,
        total_participants=len(participants),
        total_invested=total_invested,
        total_paid_out=total_paid_out,
        operator_net=operator_net,
        participants=participants,
        collapsed=collapse_month is not None,
        collapse_month=collapse_month,
        timeline=timeline,
    )


def simulate_pyramid(params: Dict[str, Any], seed: int) -> TrialResult:
    rng = random.Random(seed)

    months = int(params["months_horizon"])
    starting = int(params["starting_participants"])
    downline_req = int(params["downline_requirement"])
    entry_fee = float(params["entry_fee"])
    recruiter_share = float(params["recruiter_share"])
    mean_recruit = float(params["monthly_recruit_mean"])
    stdev_recruit = float(params["monthly_recruit_stdev"])
    pop_cap = int(params["population_cap"])
    sat_exp = float(params.get("saturation_exp", 1.5))

    outcomes: List[ParticipantOutcome] = []
    downline_counts: List[int] = []
    timeline: List[Dict[str, float]] = []

    total_invested = 0.0
    total_paid_out = 0.0

    for i in range(starting):
        outcomes.append(ParticipantOutcome(
            invested=entry_fee, received=0.0, net=-entry_fee,
            is_operator=(i == 0), is_early=True, joined_at_month=0,
        ))
        downline_counts.append(0)
    total_invested += starting * entry_fee

    timeline.append({
        "month": 0,
        "invested": total_invested,
        "paid_out": total_paid_out,
        "participants": float(len(outcomes)),
    })

    for month in range(1, months + 1):
        active_idx = [i for i, c in enumerate(downline_counts) if c < downline_req * 2]
        if not active_idx or len(outcomes) >= pop_cap:
            timeline.append({
                "month": month,
                "invested": total_invested,
                "paid_out": total_paid_out,
                "participants": float(len(outcomes)),
            })
            continue

        # As the pool gets saturated, recruitment becomes harder
        saturation = min(1.0, len(outcomes) / pop_cap)
        effective_mean = mean_recruit * (1.0 - saturation ** sat_exp)

        for idx in active_idx:
            if len(outcomes) >= pop_cap:
                break
            raw = rng.gauss(effective_mean, stdev_recruit)
            recruits = max(0, int(round(raw)))
            for _ in range(recruits):
                if len(outcomes) >= pop_cap:
                    break
                outcomes.append(ParticipantOutcome(
                    invested=entry_fee, received=0.0, net=-entry_fee,
                    is_operator=False,
                    is_early=((month / months) < 0.2),
                    joined_at_month=month,
                ))
                downline_counts.append(0)
                total_invested += entry_fee

                payout = entry_fee * recruiter_share
                outcomes[idx].received += payout
                outcomes[idx].net = outcomes[idx].received - outcomes[idx].invested
                downline_counts[idx] += 1
                total_paid_out += payout

        timeline.append({
            "month": month,
            "invested": total_invested,
            "paid_out": total_paid_out,
            "participants": float(len(outcomes)),
        })

    operator_net = outcomes[0].net if outcomes else 0.0

    return TrialResult(
        structure="pyramid",
        months_run=months,
        total_participants=len(outcomes),
        total_invested=total_invested,
        total_paid_out=total_paid_out,
        operator_net=operator_net,
        participants=outcomes,
        collapsed=False,
        collapse_month=None,
        timeline=timeline,
    )


def simulate_mlm(params: Dict[str, Any], seed: int) -> TrialResult:
    rng = random.Random(seed)

    months = int(params["months_horizon"])
    starting = int(params["starting_participants"])
    wholesale = float(params["wholesale_cost"])
    markup = float(params["retail_markup"])
    monthly_inv_req = float(params["monthly_inventory_required"])
    downline_comm = float(params["downline_commission_rate"])
    avg_sales = float(params["avg_monthly_sales_per_participant"])
    sales_std = float(params["sales_stdev"])
    growth = float(params["monthly_growth_rate"])
    dropout = float(params.get("dropout_per_month", 0.0))

    outcomes: List[ParticipantOutcome] = []
    active: List[bool] = []
    timeline: List[Dict[str, float]] = []

    for _ in range(starting):
        outcomes.append(ParticipantOutcome(
            invested=wholesale, received=0.0, net=-wholesale,
            is_operator=False, is_early=True, joined_at_month=0,
        ))
        active.append(True)

    total_invested = starting * wholesale
    total_paid_out = 0.0

    timeline.append({
        "month": 0,
        "invested": total_invested,
        "paid_out": total_paid_out,
        "participants": float(len(outcomes)),
    })

    company_take = 0.0

    for month in range(1, months + 1):
        # New entrants
        new_count = max(0, int(round(len(outcomes) * growth)))
        for _ in range(new_count):
            outcomes.append(ParticipantOutcome(
                invested=wholesale, received=0.0, net=-wholesale,
                is_operator=False,
                is_early=((month / months) < 0.2),
                joined_at_month=month,
            ))
            active.append(True)
        total_invested += new_count * wholesale
        company_take += new_count * wholesale * 0.30

        # Snapshot index of current participants so we don't pay this month's
        # arrivals (they joined at month boundary).
        existing_count = len(outcomes) - new_count

        for i in range(existing_count):
            if not active[i]:
                continue
            p = outcomes[i]

            # Forced inventory cost
            p.invested += monthly_inv_req
            company_take += monthly_inv_req * 0.30

            # Variable personal sales
            sales = max(0.0, rng.gauss(avg_sales, sales_std))
            margin = sales * markup
            p.received += margin

            # Downline commission — approximated by counting later joiners
            # (those whose index is greater than p's), weighted by their own
            # rough sales contribution. This keeps it deterministic and cheap.
            downline_size = max(0, (existing_count - i - 1) // 8)
            commission = downline_size * avg_sales * markup * downline_comm
            p.received += commission
            total_paid_out += margin + commission

            p.net = p.received - p.invested

            # Stochastic dropout: people who are deep underwater are more likely to quit
            if dropout > 0:
                under = max(0.0, -p.net)
                dropout_prob = min(0.5, dropout + 0.0002 * under)
                if rng.random() < dropout_prob:
                    active[i] = False

        total_invested = sum(o.invested for o in outcomes)
        total_paid_out_running = sum(o.received for o in outcomes)
        timeline.append({
            "month": month,
            "invested": total_invested,
            "paid_out": total_paid_out_running,
            "participants": float(len(outcomes)),
        })

    operator_net = company_take

    return TrialResult(
        structure="mlm",
        months_run=months,
        total_participants=len(outcomes),
        total_invested=total_invested,
        total_paid_out=sum(o.received for o in outcomes),
        operator_net=operator_net,
        participants=outcomes,
        collapsed=False,
        collapse_month=None,
        timeline=timeline,
    )


# ===== Monte Carlo orchestration =====

def run_monte_carlo(preset_id: str, n_trials: int = 100, base_seed: int = 42) -> Dict[str, Any]:
    preset = get_preset(preset_id)
    if not preset:
        raise ValueError(f"Unknown preset: {preset_id}")

    simulator = {
        "ponzi": simulate_ponzi,
        "pyramid": simulate_pyramid,
        "mlm": simulate_mlm,
    }[preset["structure"]]

    params = preset["params"]
    trials: List[TrialResult] = []
    for i in range(n_trials):
        trials.append(simulator(params, seed=base_seed + i))

    all_outcomes: List[ParticipantOutcome] = []
    for t in trials:
        all_outcomes.extend(t.participants)

    nets = sorted(o.net for o in all_outcomes)
    if nets:
        median_outcome = nets[len(nets) // 2]
        pct_lost = sum(1 for n in nets if n < 0) / len(nets) * 100
        pct_profited = sum(1 for n in nets if n > 0) / len(nets) * 100
        worst_loss = nets[0]
        best_gain = nets[-1]
    else:
        median_outcome = 0.0
        pct_lost = 0.0
        pct_profited = 0.0
        worst_loss = 0.0
        best_gain = 0.0

    # Histogram with 24 buckets, clamped to the inner 99% to keep outliers
    # from making the bucket size meaningless.
    if nets:
        lo = nets[max(0, int(len(nets) * 0.005))]
        hi = nets[min(len(nets) - 1, int(len(nets) * 0.995))]
        if hi <= lo:
            hi = lo + 1.0
        bucket_count = 24
        bucket_size = (hi - lo) / bucket_count
        buckets = [0] * bucket_count
        for n in nets:
            idx = int((n - lo) / bucket_size)
            idx = max(0, min(bucket_count - 1, idx))
            buckets[idx] += 1
        labels = [
            f"{round(lo + i * bucket_size):.0f}"
            for i in range(bucket_count)
        ]
        bucket_centers = [lo + (i + 0.5) * bucket_size for i in range(bucket_count)]
    else:
        buckets = []
        labels = []
        bucket_centers = []

    showcase = trials[0]

    return {
        "preset": {
            "id": preset_id,
            "name": preset["name"],
            "structure": preset["structure"],
            "structure_label": preset["structure_label"],
            "description": preset["description"],
            "explanation": preset["explanation"],
        },
        "stats": {
            "n_trials": n_trials,
            "total_participants": len(all_outcomes),
            "pct_lost_money": round(pct_lost, 1),
            "pct_profited": round(pct_profited, 1),
            "median_outcome": round(median_outcome, 2),
            "avg_operator_earnings": round(sum(t.operator_net for t in trials) / max(n_trials, 1), 2),
            "collapse_rate": round(sum(1 for t in trials if t.collapsed) / max(n_trials, 1) * 100, 1),
            "worst_loss": round(worst_loss, 2),
            "best_gain": round(best_gain, 2),
        },
        "histogram": {
            "buckets": buckets,
            "labels": labels,
            "centers": [round(c, 2) for c in bucket_centers],
        },
        "showcase": {
            "months_run": showcase.months_run,
            "total_participants": showcase.total_participants,
            "total_invested": round(showcase.total_invested, 2),
            "total_paid_out": round(showcase.total_paid_out, 2),
            "operator_net": round(showcase.operator_net, 2),
            "collapsed": showcase.collapsed,
            "collapse_month": showcase.collapse_month,
            "timeline": [
                {
                    "month": int(t["month"]),
                    "invested": round(t["invested"], 2),
                    "paid_out": round(t["paid_out"], 2),
                    "participants": int(t["participants"]),
                }
                for t in showcase.timeline
            ],
        },
    }
