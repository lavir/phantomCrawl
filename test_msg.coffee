NRP = require('node-redis-pubsub')
config =
	port: 6379
	scope: 'pubsub'

redis = require("redis");
client = redis.createClient();
redis.debug_mode = true;

nrp = new NRP(config)

client.on("connect", () ->
	console.log "Connected to the Redis server"

	nrp.on('echo:newTask', (data) ->
    console.log 'Exit'
    process.exit(0)
	)

	console.log "Flushing DB!!!!!!!!"
	client.FLUSHDB

	console.log "Send the new URL"
	client.lpush 'tasks', JSON.stringify({
		url: 'http://www.verkkokauppa.com/'
		nbThreads: 4
		crawlerPerThread: 4
		maxDepth: 1
		subDomains: false
	}), () ->
		console.log "The new url added"
		nrp.emit 'echo:newTask', ''
)