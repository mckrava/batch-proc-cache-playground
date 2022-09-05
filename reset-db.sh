#set -e
#npx sqd codegen
#npm run build
#rm -rf db/migrations/*.js
#npx sqd db drop
#npx sqd db create
#npx sqd db create-migration Init
#npx sqd db migrate

npx docker-compose down
sleep 3
npx docker-compose up -d
sleep 5
npx squid-typeorm-migration apply