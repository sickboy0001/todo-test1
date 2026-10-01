import { handle } from "hono/cloudflare-pages";
import { app } from "../src/app";

const handleApp = handle(app);

export const onRequest = async (context: Parameters<typeof handleApp>[0]) => {
	const response = await handleApp(context);
	return response.status === 404 ? context.next() : response;
};
