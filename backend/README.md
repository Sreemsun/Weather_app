# Backend Flow

This backend is a Python FastAPI proxy for OpenWeather.

## Flow

Frontend -> FastAPI backend -> OpenWeather -> normalized response -> frontend

## Endpoints

- `GET /health`
- `GET /api/locations/search?q=London`
- `GET /api/weather/current?city=London`
- `GET /api/weather/forecast?city=London`
- `GET /api/weather/bundle?city=London`

## Environment

Create a `backend/.env` file based on `.env.example` and paste your key as `OPENWEATHER_API_KEY=...`.
You can keep the other values as-is unless you are using a custom OpenWeather endpoint.

## Run

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
