FROM docker.io/library/python:3.10-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir nemo_text_processing

WORKDIR /work
