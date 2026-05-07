# PCBWorkspace

A browser-based PCB workspace with a Flask backend providing neural-network inference endpoints (JEPA-based component detection, alignment, and validation).

## Deploy to Render

The Flask server is configured for deployment on [Render](https://render.com/) as a **Web Service**.

### Why binding to `$PORT` matters

Render assigns a dynamic port to each service via the `PORT` environment variable and expects your app to listen on `0.0.0.0:$PORT`. Binding only to `127.0.0.1` (localhost) means Render's port scanner cannot reach the service and the deploy times out with a 503.

### Start command

```
gunicorn flask_server:app --bind 0.0.0.0:$PORT --workers 1 --threads 4
```

- **`flask_server:app`** – Python module `flask_server.py`, Flask object named `app`.
- **`--bind 0.0.0.0:$PORT`** – listens on all interfaces on Render's assigned port.
- **`--workers 1 --threads 4`** – single worker with 4 threads (suitable for the free/starter tier).

### Automatic configuration via `render.yaml`

A `render.yaml` is included at the repo root. Render will use it automatically when you connect this repository:

```yaml
services:
  - type: web
    name: pcbworkspace-flask
    runtime: python
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn flask_server:app --bind 0.0.0.0:$PORT --workers 1 --threads 4
```

### Health check

`GET /` and `HEAD /` both return HTTP 200 (`OK`), satisfying Render's health-check probe.
