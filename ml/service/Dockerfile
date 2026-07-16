FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app/ml/service
COPY ml/service/requirements-runtime.txt ./requirements-runtime.txt
RUN pip install --no-cache-dir --requirement requirements-runtime.txt \
    && addgroup --system propulse \
    && adduser --system --ingroup propulse --home /nonexistent propulse

COPY --chown=propulse:propulse ml/service/app.py ./app.py
COPY --chown=propulse:propulse ml/service/beta_telemetry.py ./beta_telemetry.py
COPY --chown=propulse:propulse ml/service/model_bundle.py ./model_bundle.py
COPY --chown=propulse:propulse ml/service/operational_weather.py ./operational_weather.py
COPY --chown=propulse:propulse ml/service/path_history.py ./path_history.py
COPY --chown=propulse:propulse ml/service/production_entrypoint.py ./production_entrypoint.py
COPY --chown=propulse:propulse ml/service/runtime_activation.py ./runtime_activation.py
COPY --chown=propulse:propulse ml/service/serving_manifest.py ./serving_manifest.py
COPY --chown=propulse:propulse ml/config/propagation_v4_2_runtime_activation.json /app/ml/config/propagation_v4_2_runtime_activation.json
COPY --chown=propulse:propulse ml/config/propagation_v4_2_runtime_eligibility.json /app/ml/config/propagation_v4_2_runtime_eligibility.json
COPY --chown=propulse:propulse ml/src/archive_v4/station_cast_adapter.py /app/ml/src/archive_v4/station_cast_adapter.py
COPY --chown=propulse:propulse ml/src/archive_v4_1/calibration.py /app/ml/src/archive_v4_1/calibration.py

USER propulse
EXPOSE 8000
ENTRYPOINT ["python", "production_entrypoint.py"]
