#!/bin/bash
# يشغّل Postgres المحلي وسيرفر التجربة لو مش شغالين
pg_isready -h /tmp -p 5544 >/dev/null 2>&1 || su postgres -s /bin/bash -c "/usr/lib/postgresql/16/bin/pg_ctl -D /home/claude/pg/data -l /home/claude/pg/log -o '-k /tmp -p 5544' start" >/dev/null
curl -s localhost:8090/ >/dev/null 2>&1 || (cd "$(dirname "$0")/.." && nohup node dev/server.mjs > /tmp/devserver.log 2>&1 &)
sleep 1.5
