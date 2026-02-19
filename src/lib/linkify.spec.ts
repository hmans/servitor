import { describe, it, expect } from 'vitest';
import { linkifyUrls } from './linkify';

describe('linkifyUrls', () => {
	it('converts a bare https URL into a link', () => {
		const result = linkifyUrls('Visit https://example.com for info');
		expect(result).toContain('<a href="https://example.com"');
		expect(result).toContain('target="_blank"');
		expect(result).toContain('>https://example.com</a>');
	});

	it('converts a bare http URL into a link', () => {
		const result = linkifyUrls('See http://example.com/path?q=1');
		expect(result).toContain('<a href="http://example.com/path?q=1"');
	});

	it('handles multiple URLs', () => {
		const result = linkifyUrls('Go to https://a.com and https://b.com');
		expect(result).toContain('<a href="https://a.com"');
		expect(result).toContain('<a href="https://b.com"');
	});

	it('returns plain text unchanged when no URLs', () => {
		expect(linkifyUrls('hello world')).toBe('hello world');
	});

	it('escapes HTML in surrounding text', () => {
		const result = linkifyUrls('<script>alert("xss")</script>');
		expect(result).not.toContain('<script>');
		expect(result).toContain('&lt;script&gt;');
	});

	it('does not double-escape URLs', () => {
		const result = linkifyUrls('https://example.com/foo&bar');
		expect(result).toContain('href="https://example.com/foo&amp;bar"');
		expect(result).toContain('>https://example.com/foo&amp;bar</a>');
	});
});
