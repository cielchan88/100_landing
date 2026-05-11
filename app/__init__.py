import os

from flask import Flask


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder="templates",
        static_folder=os.path.join(os.path.dirname(os.path.dirname(__file__)), "static"),
        static_url_path="/static",
    )

    app.config["FLASK_ENV"] = os.environ.get("FLASK_ENV", "production")
    app.config["DEBUG"] = app.config["FLASK_ENV"] == "development"

    project_root = os.path.dirname(os.path.dirname(__file__))
    app.config["CONTENT_DIR"] = os.path.join(project_root, "content", "days")
    app.config["SITE_URL"] = "https://100dayswithclaude.pythonanywhere.com"
    app.config["REPO_URL"] = "https://github.com/cielchan88/100_landing"
    app.config["TOTAL_DAYS"] = 100

    from .content import init_content
    init_content(app)

    from .filters import register_filters
    register_filters(app)

    from .routes import bp
    app.register_blueprint(bp)

    return app
