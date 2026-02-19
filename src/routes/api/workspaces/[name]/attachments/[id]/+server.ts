import { error } from '@sveltejs/kit';
import { readFileSync } from 'fs';
import { getWorkspace } from '$lib/server/workspaces';
import { loadMessages, getAttachmentAbsPath } from '$lib/server/conversations';

export function GET({ params }) {
	const ws = getWorkspace(params.name);
	if (!ws) error(404, 'Workspace not found');

	// Find the attachment across all messages
	const messages = loadMessages(ws.worktreePath);
	const attachment = messages
		.flatMap((m) => m.attachments ?? [])
		.find((a) => a.id === params.id);

	if (!attachment) error(404, 'Attachment not found');

	const absPath = getAttachmentAbsPath(ws.worktreePath, attachment);
	let data: Buffer;
	try {
		data = readFileSync(absPath);
	} catch {
		error(404, 'Attachment file not found');
	}

	return new Response(new Uint8Array(data), {
		headers: {
			'Content-Type': attachment.mediaType,
			'Cache-Control': 'public, immutable, max-age=31536000'
		}
	});
}
