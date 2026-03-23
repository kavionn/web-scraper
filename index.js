/**
 * Web Panel by Hann Universe
 * Version : 1.2.0
 * CDN     : https://cdn.universe.my.id/web-panel/v1.2.0/web-panel.js
 * Latest  : https://cdn.universe.my.id/web-panel/latest/web-panel.js
 * Changelog: https://cdn.universe.my.id/web-panel/manifest.json
 */
(function() {
	if (document.getElementById("web-panel-dev")) return;

	const VERSION = "1.2.0";

	const networkLog = [];

	const _fetch = window.fetch;
	window.fetch = async function(...args) {
		const input = args[0];
		const init = args[1] || {};

		let url;
		if (typeof input === "string") {
			url = input;
		} else if (input instanceof Request) {
			url = input.url;
		} else if (input instanceof URL) {
			url = input.href;
		} else {
			url = String(input);
		}

		if (url && !url.startsWith('http') && !url.startsWith('//')) {
			url = new URL(url, location.href).href;
		}

		const method = init?.method || (input instanceof Request ? input.method : "GET");
		const headers = {};

		if (init?.headers) {
			if (init.headers instanceof Headers) {
				init.headers.forEach((v, k) => headers[k] = v);
			} else if (typeof init.headers === "object") {
				Object.assign(headers, init.headers);
			}
		}

		if (input instanceof Request && input.headers) {
			input.headers.forEach((v, k) => {
				if (!headers[k]) headers[k] = v;
			});
		}

		const body = init?.body || (input instanceof Request ? input.body : null);

		const params = {};
		try {
			const urlObj = new URL(url, location.href);
			urlObj.searchParams.forEach((v, k) => params[k] = v);
		} catch (_) {}

		const logEntry = {
			url: url || "unknown",
			method: method || "GET",
			headers,
			body,
			type: "fetch",
			timestamp: Date.now(),
			params
		};

		networkLog.push(logEntry);

		try {
			const response = await _fetch.apply(this, args);
			const clonedResponse = response.clone();
			logEntry.responseStatus = response.status;
			logEntry.responseStatusText = response.statusText;
			logEntry.responseHeaders = {};
			response.headers.forEach((v, k) => {
				logEntry.responseHeaders[k] = v;
			});
			logEntry.responseContentType = response.headers.get('content-type');
			logEntry.responseTimestamp = Date.now();
			try {
				const contentType = response.headers.get('content-type') || '';
				if (contentType.includes('application/json')) {
					logEntry.responseBody = await clonedResponse.json();
				} else if (contentType.includes('text/')) {
					logEntry.responseBody = await clonedResponse.text();
				} else {
					const blob = await clonedResponse.blob();
					logEntry.responseBody = `[Binary data: ${blob.size} bytes]`;
				}
			} catch (e) {
				logEntry.responseBody = `[Failed to read: ${e.message}]`;
			}
			return response;
		} catch (error) {
			logEntry.responseStatus = 0;
			logEntry.responseStatusText = `Error: ${error.message}`;
			logEntry.responseTimestamp = Date.now();
			throw error;
		}
	};

	const _open = XMLHttpRequest.prototype.open;
	const _send = XMLHttpRequest.prototype.send;
	const _setHeader = XMLHttpRequest.prototype.setRequestHeader;

	XMLHttpRequest.prototype.open = function(method, url) {
		this._wpLog = {
			method,
			url: url?.toString() || "unknown",
			headers: {},
			body: null,
			type: "xhr",
			timestamp: Date.now(),
			params: {}
		};
		try {
			const urlObj = new URL(this._wpLog.url, location.href);
			urlObj.searchParams.forEach((v, k) => this._wpLog.params[k] = v);
		} catch (_) {}
		return _open.apply(this, arguments);
	};

	XMLHttpRequest.prototype.setRequestHeader = function(k, v) {
		if (this._wpLog) this._wpLog.headers[k] = v;
		return _setHeader.apply(this, arguments);
	};

	XMLHttpRequest.prototype.send = function(body) {
		if (this._wpLog) {
			this._wpLog.body = body || null;
			const originalOnLoad = this.onload;
			const self = this;
			this.onload = function() {
				if (self._wpLog) {
					self._wpLog.responseStatus = self.status;
					self._wpLog.responseStatusText = self.statusText;
					self._wpLog.responseHeaders = {};
					self._wpLog.responseTimestamp = Date.now();
					const headerStr = self.getAllResponseHeaders();
					if (headerStr) {
						headerStr.split('\r\n').forEach(line => {
							const [k, v] = line.split(': ');
							if (k && v) self._wpLog.responseHeaders[k] = v;
						});
					}
					try {
						self._wpLog.responseBody = self.response;
					} catch (e) {
						self._wpLog.responseBody = `[Failed to read: ${e.message}]`;
					}
				}
				if (originalOnLoad) originalOnLoad.apply(this, arguments);
			};
			networkLog.push(this._wpLog);
		}
		return _send.apply(this, arguments);
	};

	const consoleLog = [];
	const _CONSOLE_LEVELS = ["log", "warn", "error", "info", "debug", "assert", "table", "dir", "trace", "group", "groupEnd", "groupCollapsed", "time", "timeEnd", "count", "countReset", "clear"];

	(function hookConsole() {
		_CONSOLE_LEVELS.forEach(level => {
			const orig = console[level].bind(console);
			console[level] = function(...args) {
				let msg;
				try {
					msg = args.map(a => {
						if (a === null) return "null";
						if (a === undefined) return "undefined";
						if (typeof a === "object") {
							try {
								return JSON.stringify(a, null, 2);
							} catch (_) {
								return String(a);
							}
						}
						return String(a);
					}).join(" ");
				} catch (_) {
					msg = "[unserializable]";
				}

				let stack = "";
				try {
					const lines = (new Error().stack || "").split("\n");
					stack = lines.slice(3, 5).map(l => l.trim()).filter(Boolean).join(" | ");
				} catch (_) {}

				consoleLog.push({
					level,
					msg,
					stack,
					timestamp: Date.now()
				});
				if (consoleLog.length > 500) consoleLog.shift();
				orig.apply(console, args);
			};
		});
	})();

	/* ─── PLUGIN REGISTRY ─────────────────────────────────────────── */
	const registry = [];

	function registerPlugin(plugin) {
		registry.push(plugin);
	}

	registerPlugin({
	id: "cookie",
	label: "Cookie Viewer",
	color: "#1a6e2e",
	fetchData() {
		const raw = document.cookie;

		if (!raw) {
			return JSON.stringify({
				meta: {
					timestamp: new Date().toISOString(),
					host: location.hostname,
					totalCookies: 0
				},
				cookies: []
			}, null, 2);
		}

		const cookies = raw.split(";").map((c) => {
			const [key, ...rest] = c.trim().split("=");
			return {
				name: key.trim(),
				value: rest.join("=").trim()
			};
		});

		return JSON.stringify({
			meta: {
				timestamp: new Date().toISOString(),
				host: location.hostname,
				totalCookies: cookies.length
			},
			cookies
		}, null, 2);
	},
	async downloadAll() {
		const raw = document.cookie;
		if (!raw) { alert("No cookies to download."); return; }

		const cookies = raw.split(";").map((c) => {
			const [key, ...rest] = c.trim().split("=");
			return {
				name: key.trim(),
				value: rest.join("=").trim()
			};
		});

		const exportData = {
			exportedAt: new Date().toISOString(),
			panelVersion: VERSION,
			host: location.hostname,
			totalCookies: cookies.length,
			cookies
		};

		try {
			const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const win = window.open(url, "_blank");
			if (!win) { alert("Popup blocked by browser"); return; }
			setTimeout(() => URL.revokeObjectURL(url), 10000);
			return `Opened JSON export (${cookies.length} cookies)`;
		} catch(e) {
			alert("Export failed: " + e.message);
			return "Export failed";
		}
	}
});

registerPlugin({
	id: "local",
	label: "Local Storage",
	color: "#1565c0",
	fetchData() {
		const s = localStorage;

		if (!s.length) {
			return JSON.stringify({
				meta: {
					timestamp: new Date().toISOString(),
					host: location.hostname,
					storageType: "localStorage",
					totalEntries: 0
				},
				entries: []
			}, null, 2);
		}

		const entries = [];
		for (let i = 0; i < s.length; i++) {
			const k = s.key(i), v = s.getItem(k);
			let parsed = v;
			try { parsed = JSON.parse(v); } catch (_) {}
			entries.push({ key: k, value: parsed });
		}

		return JSON.stringify({
			meta: {
				timestamp: new Date().toISOString(),
				host: location.hostname,
				storageType: "localStorage",
				totalEntries: entries.length
			},
			entries
		}, null, 2);
	},
	async downloadAll() {
		if (!localStorage.length) { alert("localStorage is empty."); return; }
		if (!confirm(`Export ${localStorage.length} localStorage entries?`)) return;

		const entries = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i), v = localStorage.getItem(k);
			let parsed = v;
			try { parsed = JSON.parse(v); } catch(_) {}
			entries.push({ key: k, value: parsed });
		}

		const exportData = {
			exportedAt: new Date().toISOString(),
			panelVersion: VERSION,
			host: location.hostname,
			totalEntries: entries.length,
			storageType: "localStorage",
			entries
		};

		try {
			const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const win = window.open(url, "_blank");
			if (!win) { alert("Popup blocked by browser"); return; }
			setTimeout(() => URL.revokeObjectURL(url), 10000);
			return `Opened JSON export (${entries.length} entries)`;
		} catch(e) {
			alert("Export failed: " + e.message);
			return "Export failed";
		}
	}
});

registerPlugin({
	id: "session",
	label: "Session Storage",
	color: "#c62828",
	fetchData() {
		const s = sessionStorage;

		if (!s.length) {
			return JSON.stringify({
				meta: {
					timestamp: new Date().toISOString(),
					host: location.hostname,
					storageType: "sessionStorage",
					totalEntries: 0
				},
				entries: []
			}, null, 2);
		}

		const entries = [];
		for (let i = 0; i < s.length; i++) {
			const k = s.key(i), v = s.getItem(k);
			let parsed = v;
			try { parsed = JSON.parse(v); } catch (_) {}
			entries.push({ key: k, value: parsed });
		}

		return JSON.stringify({
			meta: {
				timestamp: new Date().toISOString(),
				host: location.hostname,
				storageType: "sessionStorage",
				totalEntries: entries.length
			},
			entries
		}, null, 2);
	},
	async downloadAll() {
		if (!sessionStorage.length) { alert("sessionStorage is empty."); return; }
		if (!confirm(`Export ${sessionStorage.length} sessionStorage entries?`)) return;

		const entries = [];
		for (let i = 0; i < sessionStorage.length; i++) {
			const k = sessionStorage.key(i), v = sessionStorage.getItem(k);
			let parsed = v;
			try { parsed = JSON.parse(v); } catch(_) {}
			entries.push({ key: k, value: parsed });
		}

		const exportData = {
			exportedAt: new Date().toISOString(),
			panelVersion: VERSION,
			host: location.hostname,
			totalEntries: entries.length,
			storageType: "sessionStorage",
			entries
		};

		try {
			const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const win = window.open(url, "_blank");
			if (!win) { alert("Popup blocked by browser"); return; }
			setTimeout(() => URL.revokeObjectURL(url), 10000);
			return `Opened JSON export (${entries.length} entries)`;
		} catch(e) {
			alert("Export failed: " + e.message);
			return "Export failed";
		}
	}
});

	registerPlugin({
	id: "sitekey",
	label: "Get Sitekey V1",
	color: "#6a1b9a",
	async fetchData() {
		const results = [];
		const scannedUrls = new Set();
		const scannedScripts = new Set();

		const patterns = {
			hCaptcha: [
				/hcaptcha\.com\/1\/api\.js\?[^"']*sitekey=([0-9a-f-]{36})/gi,
				/["']sitekey["']\s*:\s*["']([0-9a-f-]{36})["']/gi,
				/data-sitekey=["']([0-9a-f-]{36})["']/gi,
				/h-captcha[^>]+data-sitekey=["']([0-9a-f-]{36})["']/gi,
				/hcaptcha\.execute\(["']([0-9a-f-]{36})["']/gi,
				/hcaptcha\.render\([^)]*["']([0-9a-f-]{36})["']/gi,
			],
			reCAPTCHA: [
				/recaptcha\/api\.js\?[^"']*render=([0-9A-Za-z_-]{40})/gi,
				/["']sitekey["']\s*:\s*["']([0-9A-Za-z_-]{40})["']/gi,
				/data-sitekey=["']([0-9A-Za-z_-]{40})["']/gi,
				/grecaptcha\.render\([^)]*["']([0-9A-Za-z_-]{40})["']/gi,
				/grecaptcha\.execute\(["']([0-9A-Za-z_-]{40})["']/gi,
				/grecaptcha\.ready\([^)]*["']([0-9A-Za-z_-]{40})["']/gi,
				/grecaptcha\.enterprise\.render\([^)]*["']([0-9A-Za-z_-]{40})["']/gi,
			],
			Turnstile: [
				/challenges\.cloudflare\.com\/turnstile[^"']*sitekey=([0-9A-Za-z_-]{40,60})/gi,
				/["']sitekey["']\s*:\s*["']([0-1][A-Za-z0-9_-]{39,59})["']/gi,
				/data-sitekey=["']([0-1][A-Za-z0-9_-]{39,59})["']/gi,
				/turnstile\.render\([^)]*sitekey\s*:\s*["']([0-9A-Za-z_-]{40,60})["']/gi,
				/turnstile\.ready\([^)]*["']([0-9A-Za-z_-]{40,60})["']/gi,
				/cf-turnstile[^>]+data-sitekey=["']([0-9A-Za-z_-]{40,60})["']/gi,
			],
			generic: [
				/sitekey["']?\s*[:=]\s*["']([0-9A-Za-z_-]{20,60})["']/gi,
				/data-sitekey=["']([0-9A-Za-z_-]{20,60})["']/gi,
				/["']site_key["']\s*:\s*["']([0-9A-Za-z_-]{20,60})["']/gi,
				/captchaSiteKey["']?\s*[:=]\s*["']([0-9A-Za-z_-]{20,60})["']/gi,
				/g-recaptcha-response["']?\s*[:=]\s*["']([0-9A-Za-z_-]{20,60})["']/gi,
			]
		};

		function classify(key) {
			if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return "hCaptcha";
			if (/^[01][A-Za-z0-9_-]{39,}$/.test(key)) return "Turnstile";
			if (/^6L[A-Za-z0-9_-]{38}$/.test(key)) return "reCAPTCHA";
			if (/^6L[A-Za-z0-9_-]{30,50}$/.test(key)) return "reCAPTCHA Enterprise?";
			return "Unknown";
		}

		function isValidSitekey(key, type) {
			if (!key || key.length < 20) return false;
			if (key.includes(" ") || key.includes("\n")) return false;
			if (type === "reCAPTCHA") return /^6L[A-Za-z0-9_-]{30,50}$/.test(key);
			if (type === "hCaptcha") return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
			if (type === "Turnstile") return /^[01][A-Za-z0-9_-]{39,59}$/.test(key);
			return /^[A-Za-z0-9_-]{20,60}$/.test(key);
		}

		function scanText(text, sourceName, depth = 0) {
			const found = new Map();
			for (const [type, patList] of Object.entries(patterns)) {
				for (const pat of patList) {
					pat.lastIndex = 0;
					let m;
					while ((m = pat.exec(text)) !== null) {
						const key = m[1];
						if (!key || key.length < 20) continue;
						if (key.includes(" ") || key.includes("\n") || key.includes("<")) continue;
						const detectedType = classify(key);
						if (!isValidSitekey(key, detectedType)) continue;
						if (!found.has(key)) found.set(key, { type: detectedType, source: sourceName, depth });
					}
				}
			}
			return found;
		}

		function scanDocument(doc, sourceName, depth = 0) {
			const results = [];
			scanText(doc.documentElement?.innerHTML || "", `${sourceName} (HTML)`, depth)
				.forEach((val, key) => results.push({ key, ...val }));
			doc.querySelectorAll("script:not([src])").forEach((s, i) => {
				const content = s.textContent || "";
				if (content.trim() && !scannedScripts.has(content)) {
					scannedScripts.add(content);
					scanText(content, `${sourceName} (Inline Script #${i})`, depth)
						.forEach((val, key) => results.push({ key, ...val }));
				}
			});
			return results;
		}

		async function scanIframes(depth = 0) {
			if (depth > 3) return [];
			const results = [];
			const iframes = document.querySelectorAll("iframe");
			for (let i = 0; i < iframes.length; i++) {
				const iframe = iframes[i];
				try {
					const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
					if (iframeDoc) {
						results.push(...scanDocument(iframeDoc, `Iframe #${i}`, depth + 1));
						results.push(...await scanIframes(depth + 1));
					}
				} catch (e) {
					if (iframe.src && !scannedUrls.has(iframe.src)) {
						scannedUrls.add(iframe.src);
						try {
							const res = await fetch(iframe.src);
							const text = await res.text();
							scanText(text, `Iframe #${i} (cross-origin src)`, depth + 1)
								.forEach((val, key) => results.push({ key, ...val }));
						} catch (_) {}
					}
				}
			}
			return results;
		}

		function scanShadowDOM(element = document.body, depth = 0) {
			if (depth > 5) return [];
			const results = [];
			if (element.shadowRoot) {
				scanText(element.shadowRoot.innerHTML, `Shadow DOM (depth ${depth})`, depth)
					.forEach((val, key) => results.push({ key, ...val }));
				element.shadowRoot.querySelectorAll("*").forEach(child => results.push(...scanShadowDOM(child, depth + 1)));
			}
			element.querySelectorAll("*").forEach(child => {
				if (child.shadowRoot) results.push(...scanShadowDOM(child, depth + 1));
			});
			return results;
		}

		async function scanExternalResources() {
			const results = [];
			const resources = [];
			document.querySelectorAll("script[src]").forEach(s => {
				if (!scannedUrls.has(s.src)) { scannedUrls.add(s.src); resources.push({ url: s.src, type: "JS" }); }
			});
			document.querySelectorAll("link[rel='stylesheet']").forEach(s => {
				if (s.href && !scannedUrls.has(s.href)) { scannedUrls.add(s.href); resources.push({ url: s.href, type: "CSS" }); }
			});
			for (const res of resources) {
				try {
					const ctrl = new AbortController();
					const t = setTimeout(() => ctrl.abort(), 5000);
					const response = await fetch(res.url, { signal: ctrl.signal });
					clearTimeout(t);
					const text = await response.text();
					scanText(text, `${res.type}: ${res.url.split('/').pop()}`)
						.forEach((val, key) => { if (!results.find(r => r.key === key)) results.push({ key, ...val }); });
				} catch (_) {}
			}
			return results;
		}

		function scanRuntimeObjects() {
			const results = [];
			const globalsToCheck = [
				'grecaptcha', 'hcaptcha', 'turnstile',
				'___grecaptcha_cfg', '___hcaptcha_cfg',
				'window.__recaptcha_api_rendered_widgets',
				'window.hcaptchaConfig', 'window.turnstileConfig'
			];
			globalsToCheck.forEach(name => {
				try {
					const parts = name.split('.');
					let obj = window;
					for (const part of parts) { if (part === 'window') continue; obj = obj?.[part]; }
					if (obj) scanText(JSON.stringify(obj), `Runtime: ${name}`).forEach((val, key) => results.push({ key, ...val }));
				} catch (_) {}
			});
			[localStorage, sessionStorage].forEach((store, idx) => {
				const name = idx === 0 ? "localStorage" : "sessionStorage";
				for (let i = 0; i < store.length; i++) {
					const k = store.key(i), v = store.getItem(k);
					if (v) scanText(v, `${name}[${k}]`).forEach((val, key) => results.push({ key, ...val }));
				}
			});
			return results;
		}

		results.push(...scanDocument(document, "Main Document"));
		results.push(...await scanIframes());
		results.push(...scanShadowDOM());
		results.push(...await scanExternalResources());
		results.push(...scanRuntimeObjects());

		const seenKeys = new Set();
		const uniqueResults = [];
		results.forEach(r => {
			if (!seenKeys.has(r.key)) { seenKeys.add(r.key); uniqueResults.push(r); }
		});

		const grouped = {};
		uniqueResults.forEach(r => {
			if (!grouped[r.type]) grouped[r.type] = [];
			grouped[r.type].push({
				sitekey: r.key,
				source: r.source,
				...(r.depth > 0 && { depth: r.depth })
			});
		});

		return JSON.stringify({
			meta: {
				timestamp: new Date().toISOString(),
				host: location.hostname,
				totalFound: uniqueResults.length
			},
			summary: Object.fromEntries(
				Object.entries(grouped).map(([type, items]) => [type, items.length])
			),
			results: grouped
		}, null, 2);
	},
});

	registerPlugin({
	id: "cf-intercept",
	label: "Get Sitekey V2",
	color: "#e65100",
	captured: [],
	hooked: false,

	autoDownload(data) {
		try {
			const json = JSON.stringify(data, null, 2);
			const blob = new Blob([json], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "sitekey-" + location.hostname + "-" + Date.now() + ".json";
			document.body.appendChild(a);
			a.click();
			setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
		} catch (_) {}
	},

	installHook() {
		if (this.hooked) return;
		this.hooked = true;
		const self = this;

		const scanExisting = () => {
			document.querySelectorAll('.cf-turnstile, [data-sitekey], iframe[src*="turnstile"]').forEach(el => {
				const sitekey = el.getAttribute('data-sitekey') || el.dataset.sitekey ||
					(el.src && el.src.match(/sitekey=([^&]+)/)?.[1]);
				if (sitekey && !self.captured.find(c => c.sitekey === sitekey)) {
					const entry = {
						type: 'turnstile-dom',
						sitekey,
						action: el.getAttribute('data-action') || el.dataset.action || '',
						time: Date.now(),
						source: 'dom-scan'
					};
					self.captured.push(entry);
					self.autoDownload({
						host: location.hostname,
						url: location.href,
						capturedAt: new Date().toISOString(),
						entries: self.captured
					});
				}
			});
		};

		const hook = () => {
			if (window.turnstile && !window.turnstile.__wpHooked) {
				const origRender = window.turnstile.render.bind(window.turnstile);
				window.turnstile.render = function(container, params) {
					if (params?.sitekey) {
						const entry = {
							type: 'turnstile-hook',
							sitekey: params.sitekey,
							action: params.action || '',
							callback: typeof params.callback === 'function' ? 'function' : 'none',
							cData: params.cData || null,
							execution: params.execution || null,
							theme: params.theme || 'auto',
							time: Date.now()
						};
						self.captured.push(entry);
						self.autoDownload({
							host: location.hostname,
							url: location.href,
							capturedAt: new Date().toISOString(),
							entries: self.captured
						});
					}
					return origRender(container, params);
				};
				const origReady = window.turnstile.ready?.bind(window.turnstile);
				if (origReady) window.turnstile.ready = function(cb) { return origReady(cb); };
				window.turnstile.__wpHooked = true;
			}
		};

		scanExisting();
		hook();
		const poll = setInterval(() => { scanExisting(); hook(); }, 100);
		setTimeout(() => clearInterval(poll), 30000);

		if (window.MutationObserver) {
			const observer = new MutationObserver((mutations) => {
				let shouldScan = false;
				mutations.forEach(m => { if (m.addedNodes.length) shouldScan = true; });
				if (shouldScan) scanExisting();
			});
			observer.observe(document.body, { childList: true, subtree: true });
		}
	},

	fetchData() {
		this.installHook();
		if (this.captured.length === 0) {
			return "Waiting challenge cloudflare turnstile...\n\nga muncul atau ga kedownload sitekey nya? refresh lalu cepet buka panel dan pencet button get sitekey v2\n\nIt didn't appear or the sitekey didn't get downloaded? Refresh the page, then quickly open the panel and press the get sitekey V2 button.";
		}
		let out = `=== CAPTURED (${this.captured.length}) ===\n\n`;
		this.captured.forEach((c, i) => {
			out += `[${i+1}] ${c.type}\n`;
			out += `  Sitekey: ${c.sitekey}\n`;
			out += `  Action: ${c.action || '(none)'}\n`;
			out += `  Source: ${c.source || 'hook'}\n`;
			if (c.execution) out += `  Execution: ${c.execution}\n`;
			out += `  Time: ${new Date(c.time).toLocaleTimeString()}\n\n`;
		});
		return out;
	},

	async execute() {
		if (this.captured.length === 0) return "Nothing sitekey!";
		const last = this.captured[this.captured.length - 1];
		if (last.type.includes('turnstile') && window.turnstile) {
			return new Promise((resolve) => {
				const overlay = document.createElement('div');
				overlay.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999998;`;
				const div = document.createElement('div');
				div.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;background:#fff;padding:30px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.4);min-width:300px;text-align:center;`;
				const title = document.createElement('h3');
				title.textContent = 'Solving Turnstile...';
				title.style.margin = '0 0 15px 0';
				const closeBtn = document.createElement('button');
				closeBtn.textContent = '✕ Cancel';
				closeBtn.style.cssText = `position:absolute;top:10px;right:10px;border:none;background:#ff4444;color:white;cursor:pointer;padding:5px 12px;border-radius:6px;font-weight:bold;`;
				const status = document.createElement('div');
				status.style.cssText = 'margin:15px 0;font-family:monospace;font-size:12px;color:#666;';
				status.textContent = 'Rendering CAPTCHA...';
				const container = document.createElement('div');
				container.style.cssText = 'margin:20px 0;min-height:65px;';
				div.append(closeBtn, title, container, status);
				document.body.append(overlay, div);
				let resolved = false;
				const cleanup = (result) => {
					if (!resolved) {
						resolved = true;
						overlay.remove();
						div.remove();
						resolve(result);
					}
				};
				closeBtn.onclick = () => cleanup("Cancel by user");
				const timeout = setTimeout(() => cleanup("Timeout: 2 minutes no response"), 120000);
				try {
					window.turnstile.render(container, {
						sitekey: last.sitekey,
						action: last.action || undefined,
						cData: last.cData || undefined,
						execution: last.execution || undefined,
						theme: 'light',
						callback: (token) => {
							clearTimeout(timeout);
							status.innerHTML = '<span style="color:green">✓ Success!</span>';
							status.innerHTML += `<br><small>Token: ${token.substring(0, 20)}...</small>`;
							setTimeout(() => cleanup(`TOKEN:\n${token}`), 1000);
						},
						'error-callback': (err) => {
							clearTimeout(timeout);
							setTimeout(() => cleanup(`ERROR: ${err}`), 2000);
						},
						'expired-callback': () => {
							status.innerHTML = '<span style="color:orange">⚠ Token expired</span>';
						}
					});
				} catch (err) {
					clearTimeout(timeout);
					cleanup(`EXCEPTION: ${err.message}`);
				}
			});
		}
		return "Library turnstile tidak tersedia";
	},

	clear() {
		this.captured = [];
		return "Cleared";
	}
});
	
	registerPlugin({
	id: "script_dependency_viewer",
	label: "Script Dependency Viewer",
	color: "#3498db",

	async fetchData() {
		const scripts = Array.from(document.querySelectorAll("script[src]"));
		const links = Array.from(document.querySelectorAll("link[rel='stylesheet']"));
		const inlineScripts = Array.from(document.querySelectorAll("script:not([src])"));
		const inlineStyles = Array.from(document.querySelectorAll("style"));

		let out = `=== SCRIPT DEPENDENCIES (${scripts.length + inlineScripts.length}) ===\n\n`;

		if (!scripts.length) {
			out += "No external scripts found\n";
		} else {
			for (let i = 0; i < scripts.length; i++) {
				const s = scripts[i];
				out += `[${i+1}] ${s.src}\n`;
				
				const content = await this.fetchContent(s.src, 'JS');
				if (content && !content.startsWith('[')) {
					const lines = content.split('\n').length;
					const size = new Blob([content]).size;
					out += `    Status: ✓ Loaded (${lines} lines, ${(size/1024).toFixed(1)}KB)\n`;
				} else if (content && content.startsWith('[CSP')) {
					out += `    Status: ⚠ ${content.replace(/[\[\]]/g, '')}\n`;
				} else {
					const perf = performance.getEntriesByName(s.src)[0];
					if (perf) {
						out += `    Status: ⚠ CSP Blocked (Size: ${(perf.transferSize/1024).toFixed(1)}KB, Time: ${Math.round(perf.duration)}ms)\n`;
					} else {
						out += `    Status: ✗ Failed to load\n`;
					}
				}
				
				if (s.async) out += `    Async: true\n`;
				if (s.defer) out += `    Defer: true\n`;
				if (s.type) out += `    Type: ${s.type}\n`;
				if (s.crossOrigin) out += `    CrossOrigin: ${s.crossOrigin}\n`;
				if (s.integrity) out += `    Integrity: ${s.integrity.substring(0, 20)}...\n`;
				out += `\n`;
			}
		}

		if (inlineScripts.length) {
			out += `── INLINE SCRIPTS (${inlineScripts.length}) ──\n`;
			inlineScripts.forEach((s, i) => {
				const content = s.textContent?.trim() || "";
				const lines = content.split('\n').length;
				out += `[${i+1}] ${lines} lines`;
				if (s.type) out += ` | Type: ${s.type}`;
				out += `\n`;
				if (content) {
					const preview = content.substring(0, 80).replace(/\n/g, ' ');
					out += `    ${preview}${content.length > 80 ? '...' : ''}\n`;
				}
			});
			out += `\n`;
		}

		out += `=== STYLESHEETS (${links.length + inlineStyles.length}) ===\n\n`;
		
		if (!links.length) {
			out += "No external stylesheets found\n";
		} else {
			for (let i = 0; i < links.length; i++) {
				const l = links[i];
				out += `[${i+1}] ${l.href}\n`;
				
				const content = await this.fetchContent(l.href, 'CSS');
				if (content && !content.startsWith('[')) {
					const lines = content.split('\n').length;
					out += `    Status: ✓ Loaded (${lines} lines)\n`;
				} else if (content && content.startsWith('[CSP')) {
					out += `    Status: ⚠ ${content.replace(/[\[\]]/g, '')}\n`;
				} else {
					const perf = performance.getEntriesByName(l.href)[0];
					if (perf) {
						out += `    Status: ⚠ CSP Blocked (Size: ${(perf.transferSize/1024).toFixed(1)}KB)\n`;
					} else {
						out += `    Status: ✗ Failed\n`;
					}
				}
				
				if (l.media && l.media !== 'all') out += `    Media: ${l.media}\n`;
				if (l.crossOrigin) out += `    CrossOrigin: ${l.crossOrigin}\n`;
				out += `\n`;
			}
		}

		if (inlineStyles.length) {
			out += `── INLINE STYLES (${inlineStyles.length}) ──\n`;
			inlineStyles.forEach((s, i) => {
				const content = s.textContent?.trim() || "";
				const rules = content.split('}').filter(r => r.includes('{')).length;
				out += `[${i+1}] ~${rules} CSS rules (${content.length} chars)\n`;
			});
		}

		out += `\n=== RESOURCE SUMMARY ===\n`;
		const allResources = performance.getEntriesByType('resource');
		const jsRes = allResources.filter(r => r.initiatorType === 'script' || r.name.endsWith('.js'));
		const cssRes = allResources.filter(r => r.initiatorType === 'link' || r.name.endsWith('.css'));
		
		out += `External Scripts : ${scripts.length}\n`;
		out += `Inline Scripts   : ${inlineScripts.length}\n`;
		out += `External CSS     : ${links.length}\n`;
		out += `Inline Styles    : ${inlineStyles.length}\n`;
		out += `Network JS       : ${jsRes.length}\n`;
		out += `Network CSS      : ${cssRes.length}\n`;
		
		const totalBytes = allResources.reduce((a, r) => a + (r.transferSize || 0), 0);
		out += `Total Transferred: ${(totalBytes/1024).toFixed(1)}KB\n`;

		const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
		if (cspMeta) {
			out += `\n⚠ CSP Detected (meta tag): ${cspMeta.content.substring(0, 100)}\n`;
		}

		return out;
	},

	async fetchContent(url, type) {
		try {
			const ctrl = new AbortController();
			const t = setTimeout(() => ctrl.abort(), 5000);
			const res = await fetch(url, { 
				signal: ctrl.signal,
				mode: 'cors',
				credentials: 'same-origin',
				cache: 'force-cache'
			});
			clearTimeout(t);
			if (res.ok) return await res.text();
		} catch(_) {}

		try {
			const xhrResult = await this.fetchWithXHR(url);
			if (xhrResult) return xhrResult;
		} catch(_) {}

		try {
			const swResult = await this.fetchViaSW(url);
			if (swResult) return swResult;
		} catch(_) {}

		try {
			const cacheResult = await this.fetchViaCacheAPI(url);
			if (cacheResult) return cacheResult;
		} catch(_) {}

		const entries = performance.getEntriesByName(url);
		if (entries.length > 0) {
			const entry = entries[entries.length - 1];
			return `[CSP Blocked - Resource metadata only] [Size: ${entry.transferSize || 'unknown'} bytes, Duration: ${Math.round(entry.duration || 0)}ms, Protocol: ${entry.nextHopProtocol || 'unknown'}]`;
		}

		return null;
	},

	fetchWithXHR(url) {
		return new Promise((resolve) => {
			const xhr = new XMLHttpRequest();
			xhr.timeout = 8000;
			xhr.onreadystatechange = () => {
				if (xhr.readyState === 4) {
					if (xhr.status === 200) resolve(xhr.responseText);
					else resolve(null);
				}
			};
			xhr.onerror = () => resolve(null);
			xhr.ontimeout = () => resolve(null);
			
			try {
				xhr.open('GET', url, true);
				xhr.setRequestHeader('Accept', '*/*');
				xhr.send();
			} catch(e) {
				resolve(null);
			}
		});
	},

	async fetchViaSW(url) {
		if (!('serviceWorker' in navigator)) return null;
		
		try {
			const testReg = await navigator.serviceWorker.register('data:text/javascript,', { scope: './' });
			await testReg.unregister();
		} catch(e) {
			return null;
		}

		const swCode = `
			self.addEventListener('install', e => self.skipWaiting());
			self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
			self.addEventListener('fetch', e => {
				e.respondWith(
					fetch(e.request).then(r => {
						if (!r || r.status !== 200) return r;
						const clone = r.clone();
						caches.open('wp-sw').then(c => c.put(e.request, clone));
						return r;
					}).catch(() => caches.match(e.request))
				);
			});
		`;
		
		let swUrl = null;
		let reg = null;
		
		try {
			const blob = new Blob([swCode], { type: 'application/javascript' });
			swUrl = URL.createObjectURL(blob);
			reg = await navigator.serviceWorker.register(swUrl, { scope: './' });
			
			if (reg.installing) {
				await new Promise((resolve) => {
					const check = () => {
						if (reg.installing.state === 'activated') resolve();
						else setTimeout(check, 100);
					};
					check();
				});
			}
			
			const res = await fetch(url, { cache: 'reload' });
			
			const cache = await caches.open('wp-sw');
			const cached = await cache.match(url);
			let result = null;
			if (cached) result = await cached.text();
			
			await reg.unregister();
			URL.revokeObjectURL(swUrl);
			await cache.delete(url);
			
			return result;
		} catch(e) {
			if (reg) try { await reg.unregister(); } catch(_) {}
			if (swUrl) URL.revokeObjectURL(swUrl);
			return null;
		}
	},

	async fetchViaCacheAPI(url) {
		try {
			const cacheNames = await caches.keys();
			
			for (const name of cacheNames) {
				const cache = await caches.open(name);
				const match = await cache.match(url);
				if (match) {
					const text = await match.text();
					return text;
				}
				
				const urlObj = new URL(url);
				const urlNoQuery = urlObj.origin + urlObj.pathname;
				const matchNoQuery = await cache.match(urlNoQuery);
				if (matchNoQuery) {
					return await matchNoQuery.text();
				}
			}
			
			const commonCacheNames = [
				'static-resources',
				'assets',
				'js-cache',
				'css-cache',
				'workbox-precache',
				'pwa-cache'
			];
			
			for (const name of commonCacheNames) {
				try {
					const cache = await caches.open(name);
					const match = await cache.match(url);
					if (match) return await match.text();
				} catch(_) {}
			}
			
		} catch(_) {}
		
		return null;
	},

	async downloadAll() {
		const scripts = Array.from(document.querySelectorAll("script[src]"));
		const links = Array.from(document.querySelectorAll("link[rel='stylesheet']"));
		const inlineScripts = Array.from(document.querySelectorAll("script:not([src])"));
		const inlineStyles = Array.from(document.querySelectorAll("style"));

		const scriptEntries = [];
		const styleEntries = [];

		for (let i = 0; i < scripts.length; i++) {
			const s = scripts[i];
			const content = await this.fetchContent(s.src, 'JS');
			
			scriptEntries.push({
				index: i + 1,
				type: 'external',
				src: s.src,
				async: s.async,
				defer: s.defer,
				module: s.type === 'module',
				crossOrigin: s.crossOrigin,
				integrity: s.integrity,
				content: content || '[CSP/CORS Blocked]',
				fetched: content !== null && !content.startsWith('['),
				metadata: content && content.startsWith('[') ? content : null
			});
		}

		inlineScripts.forEach((s, i) => {
			scriptEntries.push({
				index: scripts.length + i + 1,
				type: 'inline',
				content: s.textContent || '',
				length: (s.textContent || '').length,
				fetched: true
			});
		});

		for (let i = 0; i < links.length; i++) {
			const l = links[i];
			const content = await this.fetchContent(l.href, 'CSS');
			
			styleEntries.push({
				index: i + 1,
				type: 'external',
				href: l.href,
				media: l.media || 'all',
				crossOrigin: l.crossOrigin,
				content: content || '[CSP/CORS Blocked]',
				fetched: content !== null && !content.startsWith('['),
				metadata: content && content.startsWith('[') ? content : null
			});
		}

		inlineStyles.forEach((s, i) => {
			styleEntries.push({
				index: links.length + i + 1,
				type: 'inline',
				content: s.textContent || '',
				length: (s.textContent || '').length,
				fetched: true
			});
		});

		const allResources = [...scriptEntries, ...styleEntries];
		const fetchedCount = allResources.filter(r => r.fetched).length;
		const blockedCount = allResources.filter(r => r.metadata).length;

		const exportData = {
			exportedAt: new Date().toISOString(),
			panelVersion: VERSION,
			host: location.hostname,
			url: location.href,
			userAgent: navigator.userAgent,
			csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || null,
			summary: {
				totalScripts: scriptEntries.length,
				externalScripts: scriptEntries.filter(s => s.type === 'external').length,
				inlineScripts: scriptEntries.filter(s => s.type === 'inline').length,
				totalStyles: styleEntries.length,
				externalStyles: styleEntries.filter(s => s.type === 'external').length,
				inlineStyles: styleEntries.filter(s => s.type === 'inline').length,
				fetchedSuccessfully: fetchedCount,
				blockedByCSP: blockedCount,
				successRate: `${((fetchedCount / allResources.length) * 100).toFixed(1)}%`
			},
			scripts: scriptEntries,
			stylesheets: styleEntries,
			network: performance.getEntriesByType('resource')
				.filter(r => r.initiatorType === 'script' || r.initiatorType === 'link')
				.map(r => ({
					name: r.name,
					initiatorType: r.initiatorType,
					transferSize: r.transferSize,
					encodedBodySize: r.encodedBodySize,
					decodedBodySize: r.decodedBodySize,
					duration: r.duration,
					startTime: r.startTime,
					responseEnd: r.responseEnd,
					nextHopProtocol: r.nextHopProtocol
				}))
		};

		try {
			const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const win = window.open(url, "_blank");
			if (!win) { alert("Popup blocked by browser"); return; }
			setTimeout(() => URL.revokeObjectURL(url), 10000);
			return `✓ Exported ${fetchedCount}/${allResources.length} resources (${blockedCount} blocked by CSP)`;
		} catch (e) {
			alert("Export failed: " + e.message);
			return "Export failed";
		}
	}
});


	registerPlugin({
		id: "network",
		label: "Network Monitor",
		color: "#00695c",

		fetchData() {
			if (!networkLog.length) {
				return "No network requests captured yet.\n\nNote: Interceptor must be loaded before requests are made.\n\nTry refreshing the page with this panel open, or wait for new requests.";
			}

			let out = `=== NETWORK LOG (${networkLog.length} requests) ===\n\n`;
			out += "'Download' to export all requests\n\n";

			networkLog.forEach((req, idx) => {
				out += this._formatRequest(req, idx);
				out += "\n";
			});

			out += "─".repeat(60);
			return out.trim();
		},

		_formatRequest(req, idx) {
			const time = new Date(req.timestamp || Date.now()).toLocaleTimeString();
			const status = req.responseStatus ? ` [${req.responseStatus}]` : " [pending]";
			const duration = req.responseTimestamp && req.timestamp ? ` ${req.responseTimestamp - req.timestamp}ms` : "";

			let out = `${"─".repeat(60)}\n`;
			out += `[${idx + 1}] ${req.type.toUpperCase()} ${req.method}${status}${duration} · ${time}\n`;
			out += `URL    : ${req.url}\n`;

			const params = req.params || {};
			if (Object.keys(params).length) {
				out += `Params (${Object.keys(params).length}):\n`;
				Object.entries(params).forEach(([k, v]) => {
					out += `  ${k}: ${String(v).slice(0, 80)}\n`;
				});
			}

			const reqHeaders = req.headers || {};
			if (Object.keys(reqHeaders).length) {
				out += `Request Headers (${Object.keys(reqHeaders).length}):\n`;
				Object.entries(reqHeaders).forEach(([k, v]) => {
					out += `  ${k}: ${String(v).slice(0, 80)}\n`;
				});
			}

			const resHeaders = req.responseHeaders || {};
			if (Object.keys(resHeaders).length) {
				out += `Response Headers (${Object.keys(resHeaders).length}):\n`;
				Object.entries(resHeaders).forEach(([k, v]) => {
					out += `  ${k}: ${String(v).slice(0, 80)}\n`;
				});
			}

			if (req.body != null) {
				const bodyStr = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
				if (bodyStr && bodyStr !== "null") {
					const preview = bodyStr.length > 200 ? `${bodyStr.slice(0, 200)}...` : bodyStr;
					out += `Request Body: ${preview}\n`;
				}
			}

			if (req.responseBody != null) {
				const respStr = typeof req.responseBody === "string" ? req.responseBody : JSON.stringify(req.responseBody);
				if (respStr && respStr !== "null") {
					const preview = respStr.length > 200 ? `${respStr.slice(0, 200)}...` : respStr;
					out += `Response Body: ${preview}\n`;
				}
			}

			return out;
		},

		async downloadAll() {
			if (!networkLog.length) {
				alert("No requests to download.");
				return;
			}
			const total = networkLog.length;
			if (!confirm(`Export ${total} request${total === 1 ? "" : "s"}?`)) return;

			const exportData = {
				exportedAt: new Date().toISOString(),
				panelVersion: VERSION,
				host: location.hostname,
				totalCaptured: total,
				exported: total,
				requests: networkLog.map((req, idx) => ({
					index: idx + 1,
					method: req.method,
					url: req.url,
					type: req.type,
					time: new Date(req.timestamp).toLocaleString(),
					timestamp: req.timestamp,
					params: req.params || {},
					headers: {
						request: req.headers || {},
						response: req.responseHeaders || {}
					},
					body: {
						request: req.body ?? null,
						response: req.responseBody ?? null
					},
					response: {
						status: req.responseStatus ?? null,
						statusText: req.responseStatusText ?? null,
						contentType: req.responseContentType ?? null
					},
					timing: {
						startTime: req.timestamp ?? null,
						endTime: req.responseTimestamp ?? null,
						duration: req.responseTimestamp && req.timestamp ? req.responseTimestamp - req.timestamp : null
					}
				}))
			};

			try {
				const blob = new Blob([JSON.stringify(exportData, null, 2)], {
					type: "application/json"
				});
				const url = URL.createObjectURL(blob);
				const win = window.open(url, "_blank");
				if (!win) {
					alert("Popup blocked by browser");
					return;
				}
				setTimeout(() => URL.revokeObjectURL(url), 10000);
				return `✓ Opened JSON export (${total} requests)`;
			} catch (e) {
				alert("Export failed: " + e.message);
				return "Export failed";
			}
		},
	});

	registerPlugin({
		id: "console",
		label: "Console Log",
		color: "#37474f",

		fetchData() {
			if (!consoleLog.length) {
				return "No console output captured yet.\n\nTry refreshing the page with the panel already open.";
			}

			const summary = {};
			consoleLog.forEach(e => {
				summary[e.level] = (summary[e.level] || 0) + 1;
			});

			let out = `=== CONSOLE LOG (${consoleLog.length} entries) ===\n`;
			out += `Summary: ` + Object.entries(summary)
				.map(([k, v]) => `${k}:${v}`)
				.join(" | ") + "\n\n";

			consoleLog.forEach((e, i) => {
				const time = new Date(e.timestamp).toLocaleTimeString();
				const date = new Date(e.timestamp).toLocaleDateString();

				const icons = {
					log: "📝",
					warn: "⚠️",
					error: "❌",
					info: "ℹ️",
					debug: "🐛",
					assert: "✓",
					trace: "🔍"
				};
				const icon = icons[e.level] || "•";

				out += `${"─".repeat(60)}\n`;
				out += `[${i+1}] ${icon} [${e.level.toUpperCase()}] ${date} ${time}\n`;

				const lines = e.msg.split('\n');
				lines.forEach((line, idx) => {
					const prefix = idx === 0 ? "MSG: " : "     ";
					out += `${prefix}${line}\n`;
				});

				if (e.stack) {
					out += `STACK:\n`;
					const stackLines = e.stack.split(" | ");
					stackLines.forEach(sl => {
						out += `    → ${sl}\n`;
					});
				}
				out += "\n";
			});

			out += `${"─".repeat(60)}`;
			return out.trim();
		},

		clear() {
			const count = consoleLog.length;
			consoleLog.length = 0;
			return `Cleared ${count} entries`;
		},

		async downloadAll() {
			const total = consoleLog.length;
			if (!total) {
				alert("No console log to download.");
				return;
			}

			if (!confirm(`Export ${total} console entr${total === 1 ? "y" : "ies"}?`)) return;

			const exportData = {
				exportedAt: new Date().toISOString(),
				panelVersion: VERSION,
				host: location.hostname,
				url: location.href,
				userAgent: navigator.userAgent,
				totalCaptured: total,
				entries: consoleLog.map((e, i) => ({
					index: i + 1,
					level: e.level,
					message: e.msg,
					stack: e.stack || null,
					timestamp: e.timestamp,
					time: new Date(e.timestamp).toLocaleString(),
					date: new Date(e.timestamp).toLocaleDateString()
				}))
			};

			try {
				const blob = new Blob([JSON.stringify(exportData, null, 2)], {
					type: "application/json"
				});
				const url = URL.createObjectURL(blob);

				const win = window.open(url, "_blank");

				if (!win) {
					alert("Popup blocked by browser");
					return;
				}

				setTimeout(() => URL.revokeObjectURL(url), 10000);
				return `✓ Exported ${total} entries`;
			} catch (e) {
				alert("Export failed: " + e.message);
				return "Export failed";
			}
		}
	});

	registerPlugin({
		id: "response_headers",
		label: "Response Headers",
		color: "#00838f",

		fetchData() {
			if (!networkLog.length) return "No network requests captured yet.\n\nNote: Interceptor harus dimuat sebelum request dibuat.\nCoba refresh halaman dengan panel sudah terbuka.";

			const requests = networkLog.filter(r => r.responseHeaders && Object.keys(r.responseHeaders).length);
			if (!requests.length) return "No response headers captured yet.";

			let out = `=== RESPONSE HEADERS (${requests.length} requests) ===\n\n`;

			requests.forEach((req, i) => {
				const time = new Date(req.timestamp).toLocaleTimeString();
				const status = req.responseStatus || "?";
				const duration = req.responseTimestamp && req.timestamp ? ` ${req.responseTimestamp - req.timestamp}ms` : "";

				out += `${"─".repeat(60)}\n`;
				out += `[${i+1}] ${req.method} ${status}${duration} · ${time}\n`;
				out += `URL: ${req.url}\n\n`;

				const headers = req.responseHeaders;
				const keys = Object.keys(headers).sort();

				const securityHeaders = [
					"strict-transport-security",
					"content-security-policy",
					"x-frame-options",
					"x-content-type-options",
					"referrer-policy",
					"permissions-policy",
					"x-xss-protection",
					"cross-origin-opener-policy",
					"cross-origin-embedder-policy",
					"cross-origin-resource-policy"
				];
				const present = securityHeaders.filter(h => headers[h]);
				const missing = securityHeaders.filter(h => !headers[h]);

				out += `Headers (${keys.length}):\n`;
				keys.forEach(k => {
					out += `  ${k}: ${headers[k]}\n`;
				});

				out += `\nSecurity Check:\n`;
				out += `  Present (${present.length}): ${present.length ? present.join(", ") : "none"}\n`;
				out += `  Missing (${missing.length}): ${missing.length ? missing.join(", ") : "none"}\n`;

				out += "\n";
			});

			out += `${"─".repeat(60)}`;
			return out.trim();
		},

		async downloadAll() {
			const requests = networkLog.filter(r => r.responseHeaders && Object.keys(r.responseHeaders).length);
			if (!requests.length) {
				alert("No response headers to download.");
				return;
			}
			if (!confirm(`Export response headers from ${requests.length} request${requests.length === 1 ? "" : "s"}?`)) return;

			const exportData = {
				exportedAt: new Date().toISOString(),
				panelVersion: VERSION,
				host: location.hostname,
				totalRequests: requests.length,
				requests: requests.map((req, i) => ({
					index: i + 1,
					method: req.method,
					url: req.url,
					status: req.responseStatus || null,
					statusText: req.responseStatusText || null,
					time: new Date(req.timestamp).toLocaleString(),
					timestamp: req.timestamp,
					duration: req.responseTimestamp && req.timestamp ? req.responseTimestamp - req.timestamp : null,
					responseHeaders: req.responseHeaders
				}))
			};

			try {
				const blob = new Blob([JSON.stringify(exportData, null, 2)], {
					type: "application/json"
				});
				const url = URL.createObjectURL(blob);
				const win = window.open(url, "_blank");
				if (!win) {
					alert("Popup blocked by browser");
					return;
				}
				setTimeout(() => URL.revokeObjectURL(url), 10000);
				return `Opened JSON export (${requests.length} requests)`;
			} catch (e) {
				alert("Export failed: " + e.message);
				return "Export failed";
			}
		}
	});

	function makeBtn(label, bg) {
		const b = document.createElement("button");
		b.textContent = label;
		Object.assign(b.style, {
			flex: "1",
			padding: "8px",
			border: "none",
			cursor: "pointer",
			background: bg || "#444",
			color: "#fff",
			borderRadius: "6px",
			fontFamily: "monospace",
			fontSize: "11px",
			transition: "all 0.2s",
		});
		return b;
	}

	const SNAP_THRESHOLD = 100;
	const FULLSCREEN_RATIO = 0.82;
	let isFullscreen = false;
	let savedRect = null;

	const panel = document.createElement("div");
	panel.id = "web-panel-dev";
	Object.assign(panel.style, {
		position: "fixed",
		top: "100px",
		left: "50px",
		width: "450px",
		height: "400px",
		minWidth: "280px",
		minHeight: "200px",
		background: "#1e1e1e",
		color: "#fff",
		border: "1px solid #555",
		borderRadius: "12px",
		zIndex: "999999999",
		fontFamily: "monospace",
		boxShadow: "0 5px 20px rgba(0,0,0,0.5)",
		display: "flex",
		flexDirection: "column",
		transition: "none",
		boxSizing: "border-box",
	});

	function enterFullscreen() {
		if (isFullscreen) return;
		isFullscreen = true;
		savedRect = {
			left: panel.style.left,
			top: panel.style.top,
			width: panel.style.width,
			height: panel.style.height
		};
		Object.assign(panel.style, {
			left: "0",
			top: "0",
			width: "100vw",
			height: "100vh",
			borderRadius: "0",
			transition: "none"
		});
		fsBtn.textContent = "⊡";
		fsBtn.title = "Exit Fullscreen";
	}

	function exitFullscreen() {
		if (!isFullscreen) return;
		isFullscreen = false;
		if (savedRect) Object.assign(panel.style, {
			left: savedRect.left,
			top: savedRect.top,
			width: savedRect.width,
			height: savedRect.height
		});
		panel.style.borderRadius = "12px";
		fsBtn.textContent = "⛶";
		fsBtn.title = "Fullscreen";
	}

	const header = document.createElement("div");
	header.textContent = `Web Panel by Hann Universe  v${VERSION}`;
	Object.assign(header.style, {
		padding: "10px",
		cursor: "move",
		background: "#2a2a2a",
		fontWeight: "bold",
		touchAction: "none",
		display: "flex",
		justifyContent: "space-between",
		alignItems: "center",
		borderRadius: "12px 12px 0 0",
		userSelect: "none",
	});

	const headerBtns = document.createElement("div");
	Object.assign(headerBtns.style, {
		display: "flex",
		gap: "4px",
		alignItems: "center",
		flexShrink: "0"
	});

	const fsBtn = document.createElement("span");
	fsBtn.textContent = "⛶";
	fsBtn.title = "Fullscreen";
	Object.assign(fsBtn.style, {
		cursor: "pointer",
		fontSize: "15px",
		padding: "0 4px",
		opacity: "0.7"
	});
	fsBtn.onmouseover = () => fsBtn.style.opacity = "1";
	fsBtn.onmouseout = () => fsBtn.style.opacity = "0.7";
	fsBtn.onclick = (e) => {
		e.stopPropagation();
		isFullscreen ? exitFullscreen() : enterFullscreen();
	};

	const minimizeBtn = document.createElement("span");
	minimizeBtn.textContent = "−";
	Object.assign(minimizeBtn.style, {
		cursor: "pointer",
		fontSize: "18px",
		padding: "0 5px",
		flexShrink: "0"
	});

	headerBtns.append(fsBtn, minimizeBtn);
	header.appendChild(headerBtns);

	const resizeHandle = document.createElement("div");
	Object.assign(resizeHandle.style, {
		position: "absolute",
		bottom: "0",
		right: "0",
		width: "22px",
		height: "22px",
		cursor: "nwse-resize",
		zIndex: "2147483647",
		background: "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.18) 40%)",
		borderBottomRightRadius: "12px",
		pointerEvents: "all",
	});
	panel.appendChild(resizeHandle);

	const content = document.createElement("div");
	Object.assign(content.style, {
		flex: "1",
		display: "flex",
		flexDirection: "column",
		overflow: "hidden"
	});

	const textarea = document.createElement("textarea");
	textarea.placeholder = "Welcome To Web Panel by Hann Universe\n\nSelect a data source below:";
	Object.assign(textarea.style, {
		flex: "1",
		background: "#111",
		color: "#0f0",
		border: "none",
		padding: "10px",
		resize: "none",
		fontSize: "12px",
		fontFamily: "monospace",
		display: "none",
		outline: "none",
	});

	const searchContainer = document.createElement("div");
	Object.assign(searchContainer.style, {
		display: "none",
		flexDirection: "column",
		flex: "1",
		overflow: "hidden"
	});

	const searchInputRow = document.createElement("div");
	Object.assign(searchInputRow.style, {
		display: "flex",
		gap: "5px",
		padding: "8px",
		background: "#252525",
		borderBottom: "1px solid #444"
	});

	const searchInput = document.createElement("input");
	searchInput.type = "text";
	searchInput.placeholder = "Search...";
	Object.assign(searchInput.style, {
		flex: "1",
		padding: "8px",
		background: "#111",
		color: "#fff",
		border: "1px solid #444",
		borderRadius: "4px",
		fontFamily: "monospace",
		fontSize: "12px",
		outline: "none",
	});

	const searchExecBtn = makeBtn("Search", "#1565c0");
	searchExecBtn.style.flex = "0 0 60px";

	const caseSensitiveBtn = makeBtn("Aa", "#444");
	caseSensitiveBtn.style.flex = "0 0 35px";
	caseSensitiveBtn.title = "Case sensitive";
	let caseSensitive = false;

	const regexBtn = makeBtn(".*", "#444");
	regexBtn.style.flex = "0 0 35px";
	regexBtn.title = "Use regex";
	let useRegex = false;

	searchInputRow.append(searchInput, searchExecBtn, caseSensitiveBtn, regexBtn);

	const searchResults = document.createElement("div");
	Object.assign(searchResults.style, {
		flex: "1",
		overflow: "auto",
		background: "#111",
		padding: "5px",
		fontSize: "11px"
	});

	const searchStatus = document.createElement("div");
	Object.assign(searchStatus.style, {
		padding: "5px 10px",
		background: "#1e1e1e",
		borderTop: "1px solid #444",
		fontSize: "11px",
		color: "#888"
	});
	searchStatus.textContent = "Ready to search";

	searchContainer.append(searchInputRow, searchResults, searchStatus);
	content.append(textarea, searchContainer);

	const mainBtnRow = document.createElement("div");
	Object.assign(mainBtnRow.style, {
		display: "flex",
		gap: "4px",
		padding: "4px",
		background: "#1e1e1e",
		flexWrap: "wrap"
	});

	const actionBtnRow = document.createElement("div");
	Object.assign(actionBtnRow.style, {
		display: "none",
		gap: "4px",
		padding: "4px",
		background: "#1e1e1e"
	});

	const searchBtnRow = document.createElement("div");
	Object.assign(searchBtnRow.style, {
		display: "none",
		gap: "4px",
		padding: "4px",
		background: "#1e1e1e"
	});

	const btnSearchBack = makeBtn("Back", "#444");
	const btnClearSearch = makeBtn("Clear", "#444");
	const btnCopySearch = makeBtn("Copy Results", "#444");
	searchBtnRow.append(btnSearchBack, btnClearSearch, btnCopySearch);

	const btnBack = makeBtn("Back", "#444");
	const btnRefresh = makeBtn("Refresh", "#444");
	const btnCopy = makeBtn("Copy", "#444");
	const btnDownloadAll = makeBtn("Download", "#2e7d32");
	actionBtnRow.append(btnBack, btnRefresh, btnCopy, btnDownloadAll);

	let currentPlugin = null;

	function renderPluginButtons() {
		while (mainBtnRow.firstChild) mainBtnRow.removeChild(mainBtnRow.firstChild);
		registry.forEach((plugin) => {
			const btn = makeBtn(plugin.label, plugin.color);
			btn.onclick = async () => {
				currentPlugin = plugin;
				showActionButtons();
				textarea.value = "Loading...";
				try {
					const res = plugin.fetchData();
					textarea.value = (res instanceof Promise) ? await res : res;
				} catch (e) {
					textarea.value = "Error: " + e.message;
				}
			};
			mainBtnRow.appendChild(btn);
		});
		const btnSearch = makeBtn("🔍 Search", "#6a1b9a");
		btnSearch.onclick = showGlobalSearchMode;
		mainBtnRow.appendChild(btnSearch);
	}

	function updateActionButtonsForPlugin(plugin) {
		while (actionBtnRow.firstChild) {
			actionBtnRow.removeChild(actionBtnRow.firstChild);
		}

		const btnBack = makeBtn("Back", "#444");
		const btnRefresh = makeBtn("Refresh", "#444");
		const btnCopy = makeBtn("Copy", "#444");

		btnBack.onclick = showMainButtons;
		btnRefresh.onclick = async () => {
			if (currentPlugin) {
				textarea.value = "Loading...";
				try {
					const res = currentPlugin.fetchData();
					textarea.value = (res instanceof Promise) ? await res : res;
				} catch (e) {
					textarea.value = "Error: " + e.message;
				}
			}
			btnRefresh.textContent = "Refreshed ✓";
			setTimeout(() => (btnRefresh.textContent = "Refresh"), 1000);
		};
		btnCopy.onclick = async () => {
			await navigator.clipboard.writeText(textarea.value);
			btnCopy.textContent = "Copied ✓";
			setTimeout(() => (btnCopy.textContent = "Copy"), 1000);
		};

		actionBtnRow.append(btnBack, btnRefresh, btnCopy);

		if (plugin.downloadAll) {
			const btnDownloadAll = makeBtn("Download", "#2e7d32");
			btnDownloadAll.onclick = async () => {
				const result = await plugin.downloadAll();
				if (result && currentPlugin?.id === plugin.id) {
					textarea.value += "\n\n" + result;
				}
				btnDownloadAll.textContent = "Done";
				setTimeout(() => (btnDownloadAll.textContent = "Download"), 2000);
			};
			actionBtnRow.appendChild(btnDownloadAll);
		}
	}

	function showMainButtons() {
		mainBtnRow.style.display = "flex";
		actionBtnRow.style.display = "none";
		searchBtnRow.style.display = "none";
		textarea.style.display = "none";
		searchContainer.style.display = "none";
		textarea.value = "";
		currentPlugin = null;
	}

	function showActionButtons() {
		mainBtnRow.style.display = "none";
		actionBtnRow.style.display = "flex";
		searchBtnRow.style.display = "none";
		textarea.style.display = "block";
		searchContainer.style.display = "none";

		if (currentPlugin) {
			updateActionButtonsForPlugin(currentPlugin);
		}
	}

	function showGlobalSearchMode() {
		mainBtnRow.style.display = "none";
		actionBtnRow.style.display = "none";
		searchBtnRow.style.display = "flex";
		textarea.style.display = "none";
		searchContainer.style.display = "flex";
		searchResults.style.display = "block";
		currentPlugin = null;
		searchStatus.textContent = "Ready to search";
		searchInput.focus();
		searchExecBtn.onclick = performGlobalSearch;
		btnSearchBack.onclick = () => {
			searchInput.value = "";
			searchResults.innerHTML = "";
			searchStatus.textContent = "Ready to search";
			showMainButtons();
		};
	}

	btnBack.onclick = showMainButtons;
	btnRefresh.onclick = async () => {
		if (currentPlugin) {
			textarea.value = "Loading...";
			try {
				const res = currentPlugin.fetchData();
				textarea.value = (res instanceof Promise) ? await res : res;
			} catch (e) {
				textarea.value = "Error: " + e.message;
			}
		}
		btnRefresh.textContent = "Refreshed ✓";
		setTimeout(() => (btnRefresh.textContent = "Refresh"), 1000);
	};

	btnCopy.onclick = async () => {
		await navigator.clipboard.writeText(textarea.value);
		btnCopy.textContent = "Copied ✓";
		setTimeout(() => (btnCopy.textContent = "Copy"), 1000);
	};

	btnDownloadAll.onclick = async () => {
		const target = currentPlugin?.downloadAll ?
			currentPlugin :
			registry.find(p => p.id === "network");
		if (!target?.downloadAll) return;
		const result = await target.downloadAll();
		if (result && currentPlugin?.id === target.id) textarea.value += "\n\n" + result;
		btnDownloadAll.textContent = "Done";
		setTimeout(() => (btnDownloadAll.textContent = "Download"), 2000);
	};

	btnClearSearch.onclick = () => {
		searchInput.value = "";
		searchResults.innerHTML = "";
		searchStatus.textContent = "Ready to search";
		searchInput.focus();
	};

	btnCopySearch.onclick = () => {
		const allText = Array.from(searchResults.querySelectorAll("div")).map(d => d.textContent).join("\n");
		if (allText) {
			navigator.clipboard.writeText(allText);
			btnCopySearch.textContent = "Copied ✓";
			setTimeout(() => (btnCopySearch.textContent = "Copy Results"), 1000);
		}
	};

	caseSensitiveBtn.onclick = () => {
		caseSensitive = !caseSensitive;
		caseSensitiveBtn.style.background = caseSensitive ? "#1565c0" : "#444";
	};
	regexBtn.onclick = () => {
		useRegex = !useRegex;
		regexBtn.style.background = useRegex ? "#1565c0" : "#444";
	};

	async function performGlobalSearch() {
		const query = searchInput.value.trim();
		if (!query) return;
		searchStatus.textContent = "Searching...";
		searchResults.innerHTML = "";

		const parsed = parseSearch(query);
		if (!parsed.keyword) {
			searchStatus.textContent = "No keyword to search.";
			return;
		}

		let searchPattern, excludePatterns;
		try {
			if (useRegex) searchPattern = new RegExp(parsed.keyword, caseSensitive ? "g" : "gi");
			else {
				const esc = parsed.keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				searchPattern = new RegExp(esc, caseSensitive ? "g" : "gi");
			}
		} catch (e) {
			searchStatus.textContent = `Invalid pattern: ${e.message}`;
			return;
		}

		excludePatterns = parsed.excludes.map(ex => {
			try {
				return new RegExp(ex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
			} catch (_) {
				return null;
			}
		}).filter(Boolean);

		const {
			scopeFlags
		} = parsed;
		const resources = [];

		if (scopeFlags.all || scopeFlags.js) {
			document.querySelectorAll("script[src]").forEach(s => resources.push({
				type: "JS",
				url: s.src
			}));
		}
		if (scopeFlags.all || scopeFlags.css) {
			document.querySelectorAll("link[rel='stylesheet']").forEach(s => resources.push({
				type: "CSS",
				url: s.href
			}));
		}
		if (scopeFlags.all || scopeFlags.html) {
			resources.push({
				type: "HTML",
				url: location.href
			});
		}
		if (scopeFlags.all || scopeFlags.js) {
			document.querySelectorAll("script:not([src])").forEach((s, i) => {
				if (s.textContent.trim()) resources.push({
					type: "INLINE-JS",
					url: `inline-script-${i}`,
					content: s.textContent
				});
			});
		}
		if (scopeFlags.all || scopeFlags.css) {
			document.querySelectorAll("style").forEach((s, i) => {
				if (s.textContent.trim()) resources.push({
					type: "INLINE-CSS",
					url: `inline-style-${i}`,
					content: s.textContent
				});
			});
		}

		if (scopeFlags.all || scopeFlags.storage) {
			[localStorage, sessionStorage].forEach((store, idx) => {
				const label = idx === 0 ? "localStorage" : "sessionStorage";
				for (let i = 0; i < store.length; i++) {
					const k = store.key(i),
						v = store.getItem(k);
					if (v) resources.push({
						type: "STORAGE",
						url: `${label}:${k}`,
						content: v
					});
				}
			});
			const cookieStr = document.cookie;
			if (cookieStr) resources.push({
				type: "STORAGE",
				url: "cookies",
				content: cookieStr
			});
		}

		const networkResources = [];
		if (scopeFlags.all || scopeFlags.network) {
			networkLog.forEach((req, idx) => {
				const label = `network[${idx+1}] ${req.method} ${req.url}`;

				let urlStr = req.url || "";
				if (req.params && Object.keys(req.params).length) urlStr += " " + JSON.stringify(req.params);
				networkResources.push({
					type: "NET-URL",
					url: label,
					content: urlStr
				});

				if (req.headers && Object.keys(req.headers).length)
					networkResources.push({
						type: "NET-REQ-HDR",
						url: label,
						content: JSON.stringify(req.headers, null, 2)
					});

				if (req.responseHeaders && Object.keys(req.responseHeaders).length)
					networkResources.push({
						type: "NET-RES-HDR",
						url: label,
						content: JSON.stringify(req.responseHeaders, null, 2)
					});

				if (req.body != null) {
					const b = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
					if (b && b !== "null") networkResources.push({
						type: "NET-REQ-BODY",
						url: label,
						content: b
					});
				}

				if (req.responseBody != null) {
					const b = typeof req.responseBody === "string" ? req.responseBody : JSON.stringify(req.responseBody);
					if (b && b !== "null") networkResources.push({
						type: "NET-RES-BODY",
						url: label,
						content: b
					});
				}
			});
		}

		const allResources = [...resources, ...networkResources];
		let totalMatches = 0,
			searchedCount = 0;
		const results = [];

		for (const res of allResources) {
			try {
				if (parsed.urlFilters.length && !parsed.urlFilters.some(f => res.url.toLowerCase().includes(f.toLowerCase()))) {
					searchedCount++;
					continue;
				}
				let text = res.content;
				if (!text) {
					const r = await fetch(res.url);
					text = await r.text();
				}
				const lines = text.split("\n");
				const fileMatches = [];
				lines.forEach((line, idx) => {
					searchPattern.lastIndex = 0;
					const matchResult = searchPattern.exec(line);
					if (!matchResult) return;
					if (excludePatterns.some(p => p.test(line))) return;
					const matchPos = matchResult.index,
						pad = 100;
					const start = Math.max(0, matchPos - pad);
					const end = Math.min(line.length, matchPos + matchResult[0].length + pad);
					const snippet = (start > 0 ? "…" : "") + line.substring(start, end) + (end < line.length ? "…" : "");
					fileMatches.push({
						line: idx + 1,
						text: snippet
					});
					totalMatches++;
				});
				if (fileMatches.length) results.push({
					...res,
					matches: fileMatches
				});
				searchedCount++;
				searchStatus.textContent = `Searching... ${searchedCount}/${allResources.length} sources`;
			} catch (_) {
				searchedCount++;
			}
		}
		renderSearchResults(results, totalMatches, searchedCount, parsed);
	}

	function parseSearch(query) {
		let q = query;
		const urlFilters = [],
			excludes = [],
			phrases = [];
		const scopeFlags = {
			html: false,
			js: false,
			css: false,
			network: false,
			storage: false,
			all: true
		};

		q = q.replace(/\bscope:(\w+)/g, (_, v) => {
			const s = v.toLowerCase();
			if (["html", "js", "css", "network", "storage"].includes(s)) {
				scopeFlags[s] = true;
				scopeFlags.all = false;
			}
			return "";
		});
		q = q.replace(/\burl:(\S+)/g, (_, v) => {
			urlFilters.push(v);
			return "";
		});
		q = q.replace(/"([^"]+)"/g, (_, v) => {
			phrases.push(v);
			return "";
		});
		q = q.replace(/(?:^|\s)-(\S+)/g, (_, v) => {
			excludes.push(v);
			return " ";
		});
		const keyword = phrases.length ? phrases.join(" ") : q.trim();
		return {
			keyword,
			urlFilters,
			excludes,
			phrases,
			scopeFlags
		};
	}

	function renderSearchResults(results, totalMatches, searchedCount, parsed) {
		const container = searchResults;
		container.innerHTML = "";
		if (!results.length) {
			container.innerHTML = `<div style="color:#888;padding:40px;text-align:center;"><div style="font-size:48px;margin-bottom:15px;">🔍</div><div style="font-size:14px;margin-bottom:8px;">No matches found</div><div style="font-size:11px;color:#666;"></div></div>`;
			searchStatus.textContent = `Searched ${searchedCount} files · No results`;
			return;
		}
		const hasActiveFilters = parsed.urlFilters.length || parsed.excludes.length || parsed.phrases.length;
		if (hasActiveFilters) {
			const filterDiv = document.createElement('div');
			filterDiv.style.cssText = "margin-bottom:12px;padding:8px;background:#1a237e;border-radius:6px;font-size:11px;";
			let filterHtml = `<div style="color:#7986cb;margin-bottom:6px;font-weight:bold;">Active Filters:</div><div style="display:flex;flex-wrap:wrap;gap:6px;">`;
			parsed.phrases.forEach(q => {
				filterHtml += `<span style="background:#283593;color:#fff;padding:3px 8px;border-radius:4px;font-size:10px;">"${q}"</span>`;
			});
			parsed.urlFilters.forEach(u => {
				filterHtml += `<span style="background:#0d47a1;color:#fff;padding:3px 8px;border-radius:4px;font-size:10px;">url:${u}</span>`;
			});
			parsed.excludes.forEach(e => {
				filterHtml += `<span style="background:#b71c1c;color:#fff;padding:3px 8px;border-radius:4px;font-size:10px;">-${e}</span>`;
			});
			filterHtml += `</div>`;
			filterDiv.innerHTML = filterHtml;
			container.appendChild(filterDiv);
		}
		results.forEach((result) => {
			const fileDiv = document.createElement("div");
			Object.assign(fileDiv.style, {
				marginBottom: "12px",
				border: "1px solid #2a2a2a",
				borderRadius: "6px",
				overflow: "hidden",
				background: "#161616"
			});
			const hdr = document.createElement("div");
			Object.assign(hdr.style, {
				background: "#212121",
				padding: "6px 10px",
				display: "flex",
				flexDirection: "column",
				gap: "4px",
				borderBottom: "1px solid #333"
			});
			const hdrTop = document.createElement("div");
			Object.assign(hdrTop.style, {
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center"
			});
			const typeBadge = document.createElement("span");
			typeBadge.textContent = result.type;
			Object.assign(typeBadge.style, {
				fontSize: "9px",
				fontWeight: "bold",
				padding: "2px 7px",
				borderRadius: "3px",
				letterSpacing: "0.8px",
				textTransform: "uppercase",
				background: result.type.includes("CSS") ? "#0d47a1" : result.type.includes("JS") ? "#bf360c" : "#1b5e20",
				color: "#fff"
			});
			const matchCount = document.createElement("span");
			matchCount.textContent = result.matches.length + " match" + (result.matches.length > 1 ? "es" : "");
			Object.assign(matchCount.style, {
				fontSize: "10px",
				color: "#f9a825",
				fontWeight: "bold"
			});
			hdrTop.append(typeBadge, matchCount);
			const isInline = result.url.startsWith("inline");
			const urlEl = document.createElement("a");
			urlEl.textContent = result.url;
			urlEl.href = isInline ? "#" : result.url;
			if (!isInline) urlEl.target = "_blank";
			Object.assign(urlEl.style, {
				fontSize: "10px",
				color: "#64b5f6",
				textDecoration: "none",
				wordBreak: "break-all",
				fontFamily: "monospace",
				lineHeight: "1.4"
			});
			urlEl.onmouseover = () => {
				urlEl.style.textDecoration = "underline";
				urlEl.style.color = "#90caf9";
			};
			urlEl.onmouseout = () => {
				urlEl.style.textDecoration = "none";
				urlEl.style.color = "#64b5f6";
			};
			hdr.append(hdrTop, urlEl);
			const matchesDiv = document.createElement("div");
			result.matches.forEach((match) => {
				const matchLine = document.createElement("div");
				Object.assign(matchLine.style, {
					padding: "4px 0",
					borderTop: "1px solid #1a1a1a",
					fontFamily: "monospace",
					fontSize: "11px",
					color: "#ccc",
					cursor: "pointer",
					whiteSpace: "pre-wrap",
					wordBreak: "break-all",
					lineHeight: "1.6",
					display: "flex",
					alignItems: "flex-start"
				});
				const lineNum = document.createElement("span");
				lineNum.textContent = match.line;
				Object.assign(lineNum.style, {
					color: "#555",
					minWidth: "36px",
					textAlign: "right",
					paddingRight: "10px",
					userSelect: "none",
					flexShrink: "0",
					borderRight: "1px solid #2a2a2a",
					marginRight: "10px"
				});
				const codeEl = document.createElement("span");
				let safe = match.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
				try {
					const kw = parsed.keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					const pattern = useRegex ? new RegExp("(" + parsed.keyword + ")", caseSensitive ? "g" : "gi") : new RegExp("(" + kw + ")", caseSensitive ? "g" : "gi");
					safe = safe.replace(pattern, '<mark style="background:#f9a825;color:#000;padding:0 2px;border-radius:2px;font-weight:bold;outline:1.5px solid #f57f17;">$1</mark>');
				} catch (_) {}
				codeEl.innerHTML = safe;
				Object.assign(codeEl.style, {
					flex: "1",
					paddingRight: "8px"
				});
				matchLine.append(lineNum, codeEl);
				matchLine.onmouseover = () => matchLine.style.background = "#1c2333";
				matchLine.onmouseout = () => matchLine.style.background = "transparent";
				matchLine.onclick = () => {
					navigator.clipboard.writeText(match.text);
					matchLine.style.background = "#1b3a1b";
					setTimeout(() => matchLine.style.background = "transparent", 700);
				};
				matchesDiv.appendChild(matchLine);
			});
			fileDiv.append(hdr, matchesDiv);
			container.appendChild(fileDiv);
		});
		const activeCount = parsed.urlFilters.length + parsed.excludes.length + parsed.phrases.length;
		const filterSummary = activeCount > 0 ? ` · ${activeCount} filter${activeCount > 1 ? 's' : ''}` : '';
		searchStatus.textContent = `Found ${totalMatches} matches in ${results.length} files (searched ${searchedCount} files)${filterSummary}`;
	}

	searchExecBtn.onclick = performGlobalSearch;
	searchInput.onkeydown = (e) => {
		if (e.key === "Enter") performGlobalSearch();
	};
	searchInput.onfocus = () => {
		if (!searchInput.value) searchStatus.innerHTML = `<div style="font-size:10px;line-height:1.4;"><span style="color:#f9a825;font-weight:bold;">Operators:</span><span style="color:#aaa;"> "exact phrase" &nbsp;·&nbsp; url:path &nbsp;·&nbsp; -exclude</span></div>`;
	};
	searchInput.onblur = () => {
		if (!searchInput.value) searchStatus.textContent = "Ready to search";
	};

	panel.append(header, content, mainBtnRow, actionBtnRow, searchBtnRow);
	document.body.appendChild(panel);
	renderPluginButtons();

	let isDrag = false,
		offsetX = 0,
		offsetY = 0;
	let isResize = false,
		resizeStartX = 0,
		resizeStartY = 0,
		resizeStartW = 0,
		resizeStartH = 0;

	function snapCheck() {
		if (isFullscreen) return;
		const rect = panel.getBoundingClientRect();
		const vw = window.innerWidth,
			vh = window.innerHeight;

		if (rect.width > vw * FULLSCREEN_RATIO || rect.height > vh * FULLSCREEN_RATIO) {
			enterFullscreen();
			return;
		}

		if (rect.left < SNAP_THRESHOLD) {
			panel.style.left = "8px";
		} else if (vw - rect.right < SNAP_THRESHOLD) {
			panel.style.left = (vw - rect.width - 8) + "px";
		}

		if (rect.top < SNAP_THRESHOLD) {
			panel.style.top = "8px";
		} else if (vh - rect.bottom < SNAP_THRESHOLD) {
			panel.style.top = (vh - rect.height - 8) + "px";
		}
	}

	function startDrag(e) {
		if (e.target === minimizeBtn || e.target === fsBtn || headerBtns.contains(e.target)) return;
		if (isFullscreen) return;
		isDrag = true;
		const x = e.touches ? e.touches[0].clientX : e.clientX;
		const y = e.touches ? e.touches[0].clientY : e.clientY;
		offsetX = x - panel.offsetLeft;
		offsetY = y - panel.offsetTop;
		e.preventDefault();
	}

	function moveDrag(e) {
		if (!isDrag) return;
		e.preventDefault();
		const x = e.touches ? e.touches[0].clientX : e.clientX;
		const y = e.touches ? e.touches[0].clientY : e.clientY;
		panel.style.left = (x - offsetX) + "px";
		panel.style.top = (y - offsetY) + "px";
	}

	function endDrag() {
		if (!isDrag) return;
		isDrag = false;
		snapCheck();
	}

	function startResize(e) {
		if (isFullscreen) return;
		isResize = true;
		resizeStartX = e.clientX;
		resizeStartY = e.clientY;
		resizeStartW = panel.offsetWidth;
		resizeStartH = panel.offsetHeight;
		document.body.style.userSelect = "none";
		document.body.style.cursor = "nwse-resize";
		e.preventDefault();
		e.stopPropagation();
	}

	function moveResize(e) {
		if (!isResize) return;
		e.preventDefault();
		const newW = Math.max(280, resizeStartW + (e.clientX - resizeStartX));
		const newH = Math.max(200, resizeStartH + (e.clientY - resizeStartY));
		panel.style.width = newW + "px";
		panel.style.height = newH + "px";
	}

	function endResize() {
		if (!isResize) return;
		isResize = false;
		document.body.style.userSelect = "";
		document.body.style.cursor = "";
		snapCheck();
	}
	header.addEventListener("mousedown", startDrag);
	document.addEventListener("mousemove", (e) => {
		moveDrag(e);
		moveResize(e);
	});
	document.addEventListener("mouseup", () => {
		endDrag();
		endResize();
	});
	header.addEventListener("touchstart", startDrag, {
		passive: false
	});
	document.addEventListener("touchmove", moveDrag, {
		passive: false
	});
	document.addEventListener("touchend", endDrag);
	resizeHandle.addEventListener("mousedown", startResize);
	resizeHandle.addEventListener("touchstart", (e) => {
		if (isFullscreen) return;
		const t = e.touches[0];
		isResize = true;
		resizeStartX = t.clientX;
		resizeStartY = t.clientY;
		resizeStartW = panel.offsetWidth;
		resizeStartH = panel.offsetHeight;
		e.preventDefault();
		e.stopPropagation();
	}, {
		passive: false
	});
	document.addEventListener("touchmove", (e) => {
		if (!isResize) return;
		const t = e.touches[0];
		e.preventDefault();
		const newW = Math.max(280, resizeStartW + (t.clientX - resizeStartX));
		const newH = Math.max(200, resizeStartH + (t.clientY - resizeStartY));
		panel.style.width = newW + "px";
		panel.style.height = newH + "px";
	}, {
		passive: false
	});
	document.addEventListener("touchend", () => {
		if (!isResize) return;
		isResize = false;
		snapCheck();
	});

	let minimized = false,
		prevHeight = panel.style.height;

	function toggleMin() {
		if (isFullscreen) {
			exitFullscreen();
			return;
		}
		if (!minimized) {
			prevHeight = panel.style.height;
			panel.style.height = "40px";
			content.style.display = "none";
			mainBtnRow.style.display = actionBtnRow.style.display = searchBtnRow.style.display = "none";
			minimized = true;
			minimizeBtn.textContent = "+";
			resizeHandle.style.display = "none";
		} else {
			panel.style.height = prevHeight;
			content.style.display = "flex";
			if (!currentPlugin) {
				mainBtnRow.style.display = "flex";
			} else {
				actionBtnRow.style.display = "flex";
				textarea.style.display = "block";
			}
			minimized = false;
			minimizeBtn.textContent = "−";
			resizeHandle.style.display = "flex";
		}
	}
	minimizeBtn.onclick = toggleMin;
	header.addEventListener("dblclick", toggleMin);
	let lastTap = 0;
	header.addEventListener("touchend", () => {
		const now = Date.now();
		if (now - lastTap < 300) toggleMin();
		lastTap = now;
	});
})();
