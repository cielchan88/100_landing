"""
WSGI configuration untuk PythonAnywhere.
File ini sudah dikonfigurasi untuk username '100dayswithclaude'.
Copy seluruh isi file ini ke:
/var/www/100dayswithclaude_pythonanywhere_com_wsgi.py
"""
import sys
import os

# Path project di PythonAnywhere
project_home = '/home/100dayswithclaude/100_landing'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Set environment variable
os.environ['FLASK_ENV'] = 'production'

from flask_app import app as application  # noqa
