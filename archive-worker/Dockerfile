FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app/archive-worker

WORKDIR /app
COPY archive-worker/requirements.txt /app/archive-worker/requirements.txt
RUN pip install --no-cache-dir --requirement /app/archive-worker/requirements.txt \
    && addgroup --system propulse \
    && adduser --system --ingroup propulse --home /nonexistent propulse

COPY --chown=propulse:propulse archive-worker/propagation_archive /app/archive-worker/propagation_archive

USER propulse
ENTRYPOINT ["python", "-m", "propagation_archive"]
CMD ["run-due"]
