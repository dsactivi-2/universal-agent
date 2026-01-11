#!/bin/bash
cd /root/universal-agent
set -a
source .env
set +a
exec node dist/server.js
