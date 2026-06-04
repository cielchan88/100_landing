import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

load_dotenv()


limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    storage_uri="memory://",
    strategy="fixed-window",
)


def create_app() -> Flask:
    project_root = Path(__file__).parent.parent

    app = Flask(
        __name__,
        template_folder="templates",
        static_folder=str(project_root / "static"),
        static_url_path="/static",
    )

    env = os.environ.get("FLASK_ENV", "development")
    app.config["FLASK_ENV"] = env
    app.config["DEBUG"] = env != "production"
    app.config["TEMPLATES_AUTO_RELOAD"] = env != "production"
    app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5MB

    limiter.init_app(app)

    from .filters import register_filters
    register_filters(app)

    from .routes import bp
    app.register_blueprint(bp)

    from .day02.blueprint import bp as day02_bp
    app.register_blueprint(day02_bp)

    from .day03.blueprint import bp as day03_bp
    app.register_blueprint(day03_bp)

    from .day04.blueprint import bp as day04_bp
    app.register_blueprint(day04_bp)

    from .day05.blueprint import bp as day05_bp
    app.register_blueprint(day05_bp)

    from .day06.blueprint import bp as day06_bp
    app.register_blueprint(day06_bp)

    from .day07.blueprint import bp as day07_bp
    app.register_blueprint(day07_bp)

    from .day08.blueprint import bp as day08_bp
    app.register_blueprint(day08_bp)

    from .day09.blueprint import bp as day09_bp
    app.register_blueprint(day09_bp)

    from .day10.blueprint import bp as day10_bp
    app.register_blueprint(day10_bp)

    from .day11.blueprint import bp as day11_bp
    app.register_blueprint(day11_bp)

    from .day12.blueprint import bp as day12_bp
    app.register_blueprint(day12_bp)

    from .day13.blueprint import bp as day13_bp
    app.register_blueprint(day13_bp)

    from .day14.blueprint import bp as day14_bp
    app.register_blueprint(day14_bp)

    from .day15.blueprint import bp as day15_bp
    app.register_blueprint(day15_bp)

    from .day16.blueprint import bp as day16_bp
    app.register_blueprint(day16_bp)

    from .day17.blueprint import bp as day17_bp
    app.register_blueprint(day17_bp)

    from .day18.blueprint import bp as day18_bp
    app.register_blueprint(day18_bp)

    from .day19.blueprint import bp as day19_bp
    app.register_blueprint(day19_bp)

    from .day20.blueprint import bp as day20_bp
    app.register_blueprint(day20_bp)

    from .day21.blueprint import bp as day21_bp
    app.register_blueprint(day21_bp)

    from .day22.blueprint import bp as day22_bp
    app.register_blueprint(day22_bp)

    from .day23.blueprint import bp as day23_bp
    app.register_blueprint(day23_bp)

    from .day24.blueprint import bp as day24_bp
    app.register_blueprint(day24_bp)

    from .day25.blueprint import bp as day25_bp
    app.register_blueprint(day25_bp)

    from .content import get_live_count

    @app.context_processor
    def inject_globals():
        return {
            "count": get_live_count(),
            "site_url": "https://100dayswithclaude.pythonanywhere.com",
            "repo_url": "https://github.com/cielchan88/100_landing",
        }

    return app
