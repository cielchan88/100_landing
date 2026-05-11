import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask

load_dotenv()


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

    from .filters import register_filters
    register_filters(app)

    from .routes import bp
    app.register_blueprint(bp)

    from .day02.blueprint import bp as day02_bp
    app.register_blueprint(day02_bp)

    from .content import get_live_count

    @app.context_processor
    def inject_globals():
        return {
            "count": get_live_count(),
            "site_url": "https://100dayswithclaude.pythonanywhere.com",
            "repo_url": "https://github.com/cielchan88/100_landing",
        }

    return app
