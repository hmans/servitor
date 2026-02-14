import { json } from '@sveltejs/kit';
import { debugState } from '$lib/server/agents/manager';

export function GET() {
	return json(debugState());
}
