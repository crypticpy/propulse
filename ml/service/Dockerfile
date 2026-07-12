FROM python:3.12-slim

WORKDIR /app
COPY ml/requirements.txt /app/ml/requirements.txt
COPY ml/service/requirements.txt /app/ml/service/requirements.txt
RUN pip install --no-cache-dir -r /app/ml/requirements.txt -r /app/ml/service/requirements.txt
COPY ml /app/ml
EXPOSE 8000
CMD ["uvicorn", "ml.service.app:app", "--host", "0.0.0.0", "--port", "8000"]
