const http = require("http");
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
	if (req.url === "/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify({
				status: "healthy",
				timestamp: new Date().toISOString(),
				service: "janitor-agent",
			})
		);
	} else {
		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("Not Found");
	}
});

server.listen(port, () => {
	console.log(`Health check server running on port ${port}`);
});
