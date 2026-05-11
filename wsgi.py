"""
WSGI configuration for 100 Days with Claude on PythonAnywhere.
Copy the contents of this file to:
/var/www/100dayswithclaude_pythonanywhere_com_wsgi.py

PythonAnywhere username: 100dayswithclaude
GitHub repo: https://github.com/cielchan88/100_landing
"""
import sys
import os

project_home = '/home/100dayswithclaude/100_landing'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

os.environ['FLASK_ENV'] = 'production'

from flask_app import app as application  # noqa
