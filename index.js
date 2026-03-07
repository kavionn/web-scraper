/**
 * Web Panel by Hann Universe
 * Version : 1.1.5
 * CDN     : https://cdn.universe.my.id/web-panel/v1.1.5/web-panel.js
 * Latest  : https://cdn.universe.my.id/web-panel/latest/web-panel.js
 * Changelog: https://cdn.universe.my.id/web-panel/manifest.json
 */
(function() {
	if (document.getElementById("web-panel-dev")) return;

	const VERSION = "1.1.5";

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

	/* ─── PLUGIN REGISTRY ─────────────────────────────────────────── */
	const registry = [];

	function registerPlugin(plugin) {
		registry.push(plugin);
	}

	registerPlugin({
		id: "cookie",
		label: "Get Cookie",
		color: "#1a6e2e",
		fetchData() {
			const raw = document.cookie;
			if (!raw) return "No cookies found.";
			const lines = raw.split(";").map((c) => {
				const [key, ...rest] = c.trim().split("=");
				return `${key.trim()}: ${rest.join("=").trim()}`;
			});
			return `=== COOKIES (${lines.length}) ===\n${lines.join("\n")}`;
		},
	});

	registerPlugin({
		id: "local",
		label: "Local Storage",
		color: "#1565c0",
		fetchData() {
			const s = localStorage;
			if (!s.length) return "localStorage is empty.";
			const lines = [];
			for (let i = 0; i < s.length; i++) {
				const k = s.key(i),
					v = s.getItem(k);
				let d = v;
				try {
					d = JSON.stringify(JSON.parse(v), null, 2);
				} catch (_) {}
				lines.push(`[${k}]\n${d}`);
			}
			return `=== LOCAL STORAGE (${lines.length} keys) ===\n\n${lines.join("\n\n")}`;
		},
	});

	registerPlugin({
		id: "session",
		label: "Session Storage",
		color: "#c62828",
		fetchData() {
			const s = sessionStorage;
			if (!s.length) return "sessionStorage is empty.";
			const lines = [];
			for (let i = 0; i < s.length; i++) {
				const k = s.key(i),
					v = s.getItem(k);
				let d = v;
				try {
					d = JSON.stringify(JSON.parse(v), null, 2);
				} catch (_) {}
				lines.push(`[${k}]\n${d}`);
			}
			return `=== SESSION STORAGE (${lines.length} keys) ===\n\n${lines.join("\n\n")}`;
		},
	});

	registerPlugin({
		id: "sitekey",
		label: "🔑 Deep Scan Sitekey",
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
				if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key))
					return "hCaptcha";
				if (/^[01][A-Za-z0-9_-]{39,}$/.test(key))
					return "Turnstile";
				if (/^6L[A-Za-z0-9_-]{38}$/.test(key))
					return "reCAPTCHA";
				if (/^6L[A-Za-z0-9_-]{38}$/.test(key))
					return "reCAPTCHA";
				if (/^6L[A-Za-z0-9_-]{30,50}$/.test(key))
					return "reCAPTCHA Enterprise?";
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
				const indent = "  ".repeat(depth);

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

							if (!found.has(key)) {
								found.set(key, {
									type: detectedType,
									source: sourceName,
									depth: depth
								});
							}
						}
					}
				}
				return found;
			}

			function scanDocument(doc, sourceName, depth = 0) {
				const results = [];

				scanText(doc.documentElement?.innerHTML || "", `${sourceName} (HTML)`, depth)
					.forEach((val, key) => results.push({
						key,
						...val
					}));

				doc.querySelectorAll("script:not([src])").forEach((s, i) => {
					const content = s.textContent || "";
					if (content.trim() && !scannedScripts.has(content)) {
						scannedScripts.add(content);
						scanText(content, `${sourceName} (Inline Script #${i})`, depth)
							.forEach((val, key) => results.push({
								key,
								...val
							}));
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
							const iframeResults = scanDocument(iframeDoc, `Iframe #${i}`, depth + 1);
							results.push(...iframeResults);

							const nestedResults = await scanIframes(depth + 1);
							results.push(...nestedResults);
						}
					} catch (e) {
						if (iframe.src && !scannedUrls.has(iframe.src)) {
							scannedUrls.add(iframe.src);
							try {
								const res = await fetch(iframe.src);
								const text = await res.text();
								scanText(text, `Iframe #${i} (cross-origin src)`, depth + 1)
									.forEach((val, key) => results.push({
										key,
										...val
									}));
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
						.forEach((val, key) => results.push({
							key,
							...val
						}));

					element.shadowRoot.querySelectorAll("*").forEach(child => {
						results.push(...scanShadowDOM(child, depth + 1));
					});
				}

				element.querySelectorAll("*").forEach(child => {
					if (child.shadowRoot) {
						results.push(...scanShadowDOM(child, depth + 1));
					}
				});

				return results;
			}

			async function scanExternalResources() {
				const results = [];
				const resources = [];

				document.querySelectorAll("script[src]").forEach(s => {
					if (!scannedUrls.has(s.src)) {
						scannedUrls.add(s.src);
						resources.push({
							url: s.src,
							type: "JS"
						});
					}
				});

				document.querySelectorAll("link[rel='stylesheet']").forEach(s => {
					if (s.href && !scannedUrls.has(s.href)) {
						scannedUrls.add(s.href);
						resources.push({
							url: s.href,
							type: "CSS"
						});
					}
				});

				for (const res of resources) {
					try {
						const controller = new AbortController();
						const timeout = setTimeout(() => controller.abort(), 5000);

						const response = await fetch(res.url, {
							signal: controller.signal
						});
						clearTimeout(timeout);

						const text = await response.text();
						scanText(text, `${res.type}: ${res.url.split('/').pop()}`)
							.forEach((val, key) => {
								if (!results.find(r => r.key === key)) {
									results.push({
										key,
										...val
									});
								}
							});
					} catch (e) {
						// Silent fail
					}
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
						for (const part of parts) {
							if (part === 'window') continue;
							obj = obj?.[part];
						}

						if (obj) {
							const str = JSON.stringify(obj);
							scanText(str, `Runtime: ${name}`)
								.forEach((val, key) => results.push({
									key,
									...val
								}));
						}
					} catch (_) {}
				});

				[localStorage, sessionStorage].forEach((store, idx) => {
					const name = idx === 0 ? "localStorage" : "sessionStorage";
					for (let i = 0; i < store.length; i++) {
						const key = store.key(i);
						const val = store.getItem(key);
						if (val) {
							scanText(val, `${name}[${key}]`)
								.forEach((v, k) => results.push({
									key: k,
									...v
								}));
						}
					}
				});

				return results;
			}

			function scanWebSockets() {
				const results = [];
				return results;
			}

			results.push(...scanDocument(document, "Main Document"));
			results.push(...await scanIframes());
			results.push(...scanShadowDOM());
			results.push(...await scanExternalResources());
			results.push(...scanRuntimeObjects());

			const uniqueResults = [];
			const seenKeys = new Set();
			results.forEach(r => {
				if (!seenKeys.has(r.key)) {
					seenKeys.add(r.key);
					uniqueResults.push(r);
				}
			});

			if (!uniqueResults.length) {
				return "=== DEEP SCAN RESULTS ===\n\nNo sitekeys found.";
			}

			const grouped = {};
			uniqueResults.forEach(r => {
				if (!grouped[r.type]) grouped[r.type] = [];
				grouped[r.type].push(r);
			});

			let out = `=== DEEP SCAN RESULTS (${uniqueResults.length} found) ===\n\n`;
			out += "Scan coverage:\n";
			out += "  ✓ Main document & inline scripts\n";
			out += "  ✓ Iframes (recursive, depth 3)\n";
			out += "  ✓ Shadow DOM trees\n";
			out += "  ✓ External JS/CSS resources\n";
			out += "  ✓ Runtime JS objects\n";
			out += "  ✓ Web Storage\n\n";

			for (const [type, items] of Object.entries(grouped)) {
				out += `── ${type} (${items.length}) ──\n`;
				items.forEach(item => {
					out += `  Key    : ${item.key}\n`;
					out += `  Source : ${item.source}\n`;
					if (item.depth > 0) out += `  Depth  : ${item.depth}\n`;
					out += `\n`;
				});
			}
			return out.trim();
		},
	});

	registerPlugin({
		id: "cf-intercept",
		label: "🛡️ CF Intercept",
		color: "#e65100",

		captured: [],
		hooked: false,

		autoDownload(data) {
			try {
				const json = JSON.stringify(data, null, 2);
				const blob = new Blob([json], {
					type: "application/json"
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = "sitekey-" + location.hostname + "-" + Date.now() + ".json";
				document.body.appendChild(a);
				a.click();
				setTimeout(() => {
					URL.revokeObjectURL(url);
					a.remove();
				}, 1000);
			} catch (_) {}
		},

		installHook() {
			if (this.hooked) return;
			this.hooked = true;

			const self = this;

			const scanExisting = () => {
				document.querySelectorAll('.cf-turnstile, [data-sitekey], iframe[src*="turnstile"]').forEach(el => {
					const sitekey = el.getAttribute('data-sitekey') ||
						el.dataset.sitekey ||
						(el.src && el.src.match(/sitekey=([^&]+)/)?.[1]);

					if (sitekey && !self.captured.find(c => c.sitekey === sitekey)) {
						const entry = {
							type: 'turnstile-dom',
							sitekey: sitekey,
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
					if (origReady) {
						window.turnstile.ready = function(callback) {
							console.log('[CF Intercept] turnstile.ready() called');
							return origReady(callback);
						};
					}

					window.turnstile.__wpHooked = true;
					console.log('[CF Intercept] Hook installed');
				}
			};

			scanExisting();
			hook();

			const poll = setInterval(() => {
				scanExisting();
				hook();
			}, 100);

			setTimeout(() => clearInterval(poll), 30000);

			if (window.MutationObserver) {
				const observer = new MutationObserver((mutations) => {
					let shouldScan = false;
					mutations.forEach(m => {
						if (m.addedNodes.length) shouldScan = true;
					});
					if (shouldScan) scanExisting();
				});
				observer.observe(document.body, {
					childList: true,
					subtree: true
				});
			}
		},

		fetchData() {
			this.installHook();

			if (this.captured.length === 0) {
				return "⏳ Menunggu challenge...\n\nga muncul atau ga kedownload sitekey nya? refresh lalu cepet buka panel dan pencet button cf intercept";
			}

			let out = `=== CAPTURED (${this.captured.length}) ===\n\n`;

			this.captured.forEach((c, i) => {
				out += `[${i+1}] ${c.type}\n`;
				out += `  Sitekey: ${c.sitekey}\n`;
				out += `  Action: ${c.action || '(none)'}\n`;
				out += `  Source: ${c.source || 'hook'}\n`;
				if (c.execution) out += `  Execution: ${c.execution}\n`;
				out += `  Time: ${new Date(c.time).toLocaleTimeString()}\n`;
				out += `\n`;
			});

			return out;
		},

		async execute() {
			if (this.captured.length === 0) {
				return "❌ Belum ada sitekey!";
			}

			const last = this.captured[this.captured.length - 1];

			if (last.type.includes('turnstile') && window.turnstile) {
				return new Promise((resolve) => {
					const overlay = document.createElement('div');
					overlay.style.cssText = `
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.5);
                    z-index: 999998;
                `;

					const div = document.createElement('div');
					div.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 999999;
                    background: #fff;
                    padding: 30px;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.4);
                    min-width: 300px;
                    text-align: center;
                `;

					const title = document.createElement('h3');
					title.textContent = 'Solving Turnstile...';
					title.style.margin = '0 0 15px 0';

					const closeBtn = document.createElement('button');
					closeBtn.textContent = '✕ Cancel';
					closeBtn.style.cssText = `
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    border: none;
                    background: #ff4444;
                    color: white;
                    cursor: pointer;
                    padding: 5px 12px;
                    border-radius: 6px;
                    font-weight: bold;
                `;

					const status = document.createElement('div');
					status.style.cssText = 'margin: 15px 0; font-family: monospace; font-size: 12px; color: #666;';
					status.textContent = 'Rendering CAPTCHA...';

					const container = document.createElement('div');
					container.style.cssText = 'margin: 20px 0; min-height: 65px;';

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

					closeBtn.onclick = () => cleanup("❌ Dibatalkan user");

					const timeout = setTimeout(() => {
						cleanup("⏰ Timeout: 2 menit tanpa respons");
					}, 120000);

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
								self.autoDownload({
									host: location.hostname,
									url: location.href,
									solvedAt: new Date().toISOString(),
									sitekey: last.sitekey,
									token
								});
								setTimeout(() => cleanup(`✅ TOKEN:\n${token}`), 1000);
							},
							'error-callback': (err) => {
								clearTimeout(timeout);
								status.innerHTML = `<span style="color:red">✗ Error: ${err}</span>`;
								setTimeout(() => cleanup(`❌ ERROR: ${err}`), 2000);
							},
							'expired-callback': () => {
								status.innerHTML = '<span style="color:orange">⚠ Token expired</span>';
							}
						});
					} catch (err) {
						clearTimeout(timeout);
						cleanup(`💥 EXCEPTION: ${err.message}`);
					}
				});
			}

			return "❌ Library turnstile tidak tersedia";
		},

		clear() {
			this.captured = [];
			return "✅ Cleared";
		}
	});

	registerPlugin({
		id: "network",
		label: "🌐 Network",
		color: "#00695c",

		fetchData() {
			if (!networkLog.length) {
				return "No network requests captured yet.\n\nNote: Interceptor must be loaded before requests are made.\n\nTry refreshing the page with this panel open, or wait for new requests.";
			}

			let out = `=== NETWORK LOG (${networkLog.length} requests) ===\n\n`;
			out += "💡 Click 'Download All' to save each request as JSON file\n\n";

			const recent = networkLog.slice(-50).reverse();

			recent.forEach((req, i) => {
				const idx = networkLog.length - i;
				const time = new Date(req.timestamp || Date.now()).toLocaleTimeString();
				const hasResponse = req.responseStatus ? ` [${req.responseStatus}]` : ' [pending...]';

				out += `── [${idx}] ${req.type.toUpperCase()} ${req.method}${hasResponse} ── ${time}\n`;
				out += `  URL: ${req.url}\n`;

				if (req.params && Object.keys(req.params).length > 0) {
					out += `  Query Params (${Object.keys(req.params).length}):\n`;
					Object.entries(req.params).forEach(([k, v]) => {
						out += `    ${k}: ${String(v).slice(0, 60)}\n`;
					});
				}

				const reqHeaderCount = Object.keys(req.headers || {}).length;
				if (reqHeaderCount > 0) {
					out += `  Request Headers (${reqHeaderCount}):\n`;
					Object.entries(req.headers).forEach(([k, v]) => {
						const isSensitive = /authorization|token|key|secret|password|cookie/i.test(k);
						const valStr = String(v);
						const display = isSensitive ?
							`${valStr.slice(0, 15)}... [REDACTED]` :
							valStr.slice(0, 60);
						out += `    ${k}: ${display}\n`;
					});
				}

				if (req.responseHeaders && Object.keys(req.responseHeaders).length > 0) {
					out += `  Response Headers (${Object.keys(req.responseHeaders).length}):\n`;
					Object.entries(req.responseHeaders).forEach(([k, v]) => {
						out += `    ${k}: ${String(v).slice(0, 60)}\n`;
					});
				}

				if (req.body) {
					const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
					if (bodyStr && bodyStr !== "null" && bodyStr !== "undefined") {
						const preview = bodyStr.slice(0, 100) + (bodyStr.length > 100 ? `... (${bodyStr.length} chars)` : '');
						out += `  Request Body: ${preview}\n`;
					}
				}

				if (req.responseBody) {
					const respStr = typeof req.responseBody === 'string' ?
						req.responseBody :
						JSON.stringify(req.responseBody);
					const preview = respStr.slice(0, 100) + (respStr.length > 100 ? `... (${respStr.length} chars)` : '');
					out += `  Response Body: ${preview}\n`;
				}

				out += `\n`;
			});

			if (networkLog.length > 50) {
				out += `\n... and ${networkLog.length - 50} more requests (showing last 50)\n`;
			}

			return out.trim();
		},

		downloadAll() {
			if (!networkLog.length) {
				alert("No requests to download!");
				return;
			}

			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

			networkLog.forEach((req, index) => {
				const data = {
					metadata: {
						index: index + 1,
						total: networkLog.length,
						exportedAt: new Date().toISOString(),
						panelVersion: VERSION
					},
					request: {
						method: req.method,
						url: req.url,
						type: req.type,
						timestamp: req.timestamp,
						time: new Date(req.timestamp).toLocaleString()
					},
					headers: {
						request: req.headers || {},
						response: req.responseHeaders || {}
					},
					params: req.params || {},
					body: {
						request: req.body || null,
						response: req.responseBody || null
					},
					response: {
						status: req.responseStatus || null,
						statusText: req.responseStatusText || null,
						contentType: req.responseContentType || null
					},
					timing: {
						startTime: req.timestamp,
						endTime: req.responseTimestamp || null,
						duration: req.responseTimestamp ? (req.responseTimestamp - req.timestamp) : null
					}
				};

				const blob = new Blob([JSON.stringify(data, null, 2)], {
					type: 'application/json'
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `request-${String(index + 1).padStart(3, '0')}-${req.method}-${timestamp}.json`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			});

			return `Downloaded ${networkLog.length} files!`;
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

	const panel = document.createElement("div");
	panel.id = "web-panel-dev";
	Object.assign(panel.style, {
		position: "fixed",
		top: "100px",
		left: "50px",
		width: "450px",
		height: "400px",
		background: "#1e1e1e",
		color: "#fff",
		border: "1px solid #555",
		borderRadius: "12px",
		zIndex: "999999999",
		fontFamily: "monospace",
		boxShadow: "0 5px 20px rgba(0,0,0,0.5)",
		display: "flex",
		flexDirection: "column",
		transition: "left .25s ease",
	});

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

	const minimizeBtn = document.createElement("span");
	minimizeBtn.textContent = "−";
	Object.assign(minimizeBtn.style, {
		cursor: "pointer",
		fontSize: "18px",
		padding: "0 5px",
		flexShrink: "0"
	});
	header.appendChild(minimizeBtn);

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
		borderBottom: "1px solid #444",
	});

	const searchInput = document.createElement("input");
	searchInput.type = "text";
	searchInput.placeholder = "Search in all resources (JS, HTML, CSS)...";
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
		color: "#888",
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

	const btnBack = makeBtn("Back", "#444");
	const btnRefresh = makeBtn("Refresh", "#444");
	const btnCopy = makeBtn("Copy", "#444");
	const btnDownloadAll = makeBtn("⬇️ Download", "#2e7d32");
	const btnSearchBack = makeBtn("Back", "#444");
	const btnClearSearch = makeBtn("Clear", "#444");
	const btnCopySearch = makeBtn("Copy Results", "#444");

	actionBtnRow.append(btnBack, btnRefresh, btnCopy, btnDownloadAll);
	searchBtnRow.append(btnSearchBack, btnClearSearch, btnCopySearch);

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
		btnSearch.onclick = showSearchMode;
		mainBtnRow.appendChild(btnSearch);
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
	}

	function showSearchMode() {
		mainBtnRow.style.display = "none";
		actionBtnRow.style.display = "none";
		searchBtnRow.style.display = "flex";
		textarea.style.display = "none";
		searchContainer.style.display = "flex";
		currentPlugin = null;
		searchInput.focus();
	}

	btnBack.onclick = showMainButtons;
	btnSearchBack.onclick = showMainButtons;

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

	btnDownloadAll.onclick = () => {
		const networkPlugin = registry.find(p => p.id === "network");
		if (networkPlugin && networkPlugin.downloadAll) {
			const result = networkPlugin.downloadAll();
			if (currentPlugin?.id === "network") {
				textarea.value += "\n\n" + result;
			}
			btnDownloadAll.textContent = "✓ Done";
			setTimeout(() => (btnDownloadAll.textContent = "⬇️ Download"), 2000);
		}
	};

	btnClearSearch.onclick = () => {
		searchInput.value = "";
		searchResults.innerHTML = "";
		searchStatus.textContent = "Ready to search";
		searchInput.focus();
	};

	btnCopySearch.onclick = () => {
		const allText = Array.from(searchResults.querySelectorAll("div")).map((d) => d.textContent).join("\n");
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

		const resources = [];
		document.querySelectorAll("script[src]").forEach((s) => resources.push({
			type: "JS",
			url: s.src
		}));
		document.querySelectorAll("link[rel='stylesheet']").forEach((s) => resources.push({
			type: "CSS",
			url: s.href
		}));
		resources.push({
			type: "HTML",
			url: location.href
		});
		document.querySelectorAll("script:not([src])").forEach((s, i) => {
			if (s.textContent.trim()) resources.push({
				type: "INLINE-JS",
				url: `inline-script-${i}`,
				content: s.textContent
			});
		});
		document.querySelectorAll("style").forEach((s, i) => {
			if (s.textContent.trim()) resources.push({
				type: "INLINE-CSS",
				url: `inline-style-${i}`,
				content: s.textContent
			});
		});

		const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const searchPattern = useRegex ?
			new RegExp(query, caseSensitive ? "g" : "gi") :
			new RegExp(escapedQuery, caseSensitive ? "g" : "gi");

		let totalMatches = 0,
			searchedCount = 0;
		const results = [];

		for (const res of resources) {
			try {
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
					if (matchResult) {
						const matchPos = matchResult.index;
						const contextPad = 80;
						const start = Math.max(0, matchPos - contextPad);
						const end = Math.min(line.length, matchPos + matchResult[0].length + contextPad);
						const snippet = (start > 0 ? "…" : "") + line.substring(start, end) + (end < line.length ? "…" : "");
						fileMatches.push({
							line: idx + 1,
							text: snippet,
							matchPos: matchPos - start + (start > 0 ? 1 : 0)
						});
						totalMatches++;
					}
				});
				if (fileMatches.length) results.push({
					...res,
					matches: fileMatches
				});
				searchedCount++;
				searchStatus.textContent = `Searching... ${searchedCount}/${resources.length} files`;
			} catch (_) {
				searchedCount++;
			}
		}

		if (!results.length) {
			searchResults.innerHTML = '<div style="color:#888;padding:20px;text-align:center;">No matches found</div>';
		} else {
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
					borderBottom: "1px solid #333",
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
					color: "#fff",
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
					lineHeight: "1.4",
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
						alignItems: "flex-start",
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
						marginRight: "10px",
						paddingTop: "0",
					});

					const codeEl = document.createElement("span");
					let safe = match.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
					try {
						const pat = useRegex ?
							new RegExp("(" + query + ")", caseSensitive ? "g" : "gi") :
							new RegExp("(" + escapedQuery + ")", caseSensitive ? "g" : "gi");
						safe = safe.replace(pat,
							'<mark style="background:#f9a825;color:#000;padding:0 2px;border-radius:2px;font-weight:bold;outline:1.5px solid #f57f17;">$1</mark>'
						);
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
				searchResults.appendChild(fileDiv);
			});
		}

		searchStatus.textContent = `Found ${totalMatches} matches in ${results.length} files (searched ${searchedCount} files)`;
	}

	searchExecBtn.onclick = performGlobalSearch;
	searchInput.onkeydown = (e) => {
		if (e.key === "Enter") performGlobalSearch();
	};

	panel.append(header, content, mainBtnRow, actionBtnRow, searchBtnRow);
	document.body.appendChild(panel);
	renderPluginButtons();

	let isDrag = false,
		offsetX = 0,
		offsetY = 0;

	function startDrag(e) {
		if (e.target === minimizeBtn) return;
		isDrag = true;
		panel.style.transition = "none";
		const x = e.touches ? e.touches[0].clientX : e.clientX;
		const y = e.touches ? e.touches[0].clientY : e.clientY;
		offsetX = x - panel.offsetLeft;
		offsetY = y - panel.offsetTop;
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
		panel.style.transition = "left .25s ease";
		const rect = panel.getBoundingClientRect();
		if (rect.left < 30 || window.innerWidth - rect.right < 30) {
			panel.style.left = rect.left + rect.width / 2 < window.innerWidth / 2 ?
				-(rect.width - 40) + "px" :
				(window.innerWidth - 40) + "px";
		}
	}

	header.addEventListener("mousedown", startDrag);
	document.addEventListener("mousemove", moveDrag);
	document.addEventListener("mouseup", endDrag);
	header.addEventListener("touchstart", startDrag, {
		passive: false
	});
	document.addEventListener("touchmove", moveDrag, {
		passive: false
	});
	document.addEventListener("touchend", endDrag);

	let minimized = false,
		prevHeight = panel.style.height;

	function toggleMin() {
		if (!minimized) {
			prevHeight = panel.style.height;
			panel.style.height = "40px";
			content.style.display = "none";
			mainBtnRow.style.display = actionBtnRow.style.display = searchBtnRow.style.display = "none";
			minimized = true;
			minimizeBtn.textContent = "+";
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

	registerPlugin({
		id: "cf-intercept",
		label: "🛡️ CF Intercept",
		color: "#e65100",

		captured: [],
		hooked: false,

		autoDownload(data) {
			try {
				const json = JSON.stringify(data, null, 2);
				const blob = new Blob([json], {
					type: "application/json"
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = "sitekey-" + location.hostname + "-" + Date.now() + ".json";
				document.body.appendChild(a);
				a.click();
				setTimeout(() => {
					URL.revokeObjectURL(url);
					a.remove();
				}, 1000);
			} catch (_) {}
		},

		installHook() {
			if (this.hooked) return;
			this.hooked = true;
			const self = this;

			const push = (entry) => {
				if (self.captured.find(c => c.sitekey === entry.sitekey)) return;
				self.captured.push(entry);
				self.autoDownload({
					host: location.hostname,
					url: location.href,
					capturedAt: new Date().toISOString(),
					entries: self.captured
				});
			};

			const scanDOM = () => {
				document.querySelectorAll(".cf-turnstile, [data-sitekey], iframe[src*=\"turnstile\"]").forEach(el => {
					const sk = el.getAttribute("data-sitekey") || el.dataset?.sitekey ||
						(el.src && el.src.match(/sitekey=([^&]+)/)?.[1]);
					if (sk) push({
						type: "dom",
						sitekey: sk,
						action: el.getAttribute("data-action") || "",
						source: "dom-scan",
						time: Date.now()
					});
				});
			};

			const scanNetwork = () => {
				for (const entry of networkLog) {
					if (!entry.responseBody || typeof entry.responseBody !== "string") continue;
					const text = entry.responseBody;
					const patterns = [
						/['"](0x[0-9A-Za-z_\-]{20,})['"]/g,
						/['"](1x[0-9A-Za-z_\-]{20,})['"]/g,
						/sitekey['"\s:]+['"]([0-9A-Za-z_\-]{20,})['"]/g,
					];
					for (const pat of patterns) {
						let m;
						while ((m = pat.exec(text)) !== null) {
							push({
								type: "network-intercept",
								sitekey: m[1],
								source: entry.url,
								time: Date.now()
							});
						}
					}
				}
			};

			const hookTurnstile = () => {
				if (window.turnstile && !window.turnstile.__wpHooked) {
					const orig = window.turnstile.render.bind(window.turnstile);
					window.turnstile.render = function(container, params) {
						if (params?.sitekey) push({
							type: "turnstile-render",
							sitekey: params.sitekey,
							action: params.action || "",
							cData: params.cData || null,
							execution: params.execution || null,
							source: "turnstile.render()",
							time: Date.now()
						});
						return orig(container, params);
					};
					window.turnstile.__wpHooked = true;
				}
			};

			scanDOM();
			scanNetwork();
			hookTurnstile();

			const poll = setInterval(() => {
				scanDOM();
				scanNetwork();
				hookTurnstile();
			}, 200);
			setTimeout(() => clearInterval(poll), 30000);

			new MutationObserver(() => {
					scanDOM();
					scanNetwork();
				})
				.observe(document.documentElement, {
					childList: true,
					subtree: true
				});
		},

		fetchData() {
			this.installHook();

			if (!this.captured.length) {
				const cfOpt = window._cf_chl_opt;
				if (cfOpt) {
					return "CF Challenge terdeteksi:\n\nZone : " + cfOpt.cZone + "\nRay  : " + cfOpt.cRay + "\nType : " + cfOpt.cType + "\n\n⏳ Menunggu orchestrate script load...\nKlik Refresh dalam 2-3 detik.";
				}
				return "Belum ada sitekey tertangkap.\n\nBuka halaman CF challenge lalu klik plugin ini.";
			}

			let out = "=== CAPTURED (" + this.captured.length + ") ===\n\n";
			this.captured.forEach((c, i) => {
				out += "[" + (i + 1) + "] " + c.type + "\n";
				out += "  Sitekey : " + c.sitekey + "\n";
				out += "  Action  : " + (c.action || "(none)") + "\n";
				out += "  Source  : " + c.source + "\n";
				out += "  Time    : " + new Date(c.time).toLocaleTimeString() + "\n\n";
			});
			out += "✅ File JSON sudah otomatis didownload.";
			return out;
		},

		async execute() {
			if (!this.captured.length) return "Belum ada sitekey!";
			const last = this.captured[this.captured.length - 1];
			if (!window.turnstile) return "turnstile library tidak tersedia.";
			const self = this;

			return new Promise((resolve) => {
				const overlay = document.createElement("div");
				overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999998";
				const box = document.createElement("div");
				box.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;background:#fff;padding:28px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.4);min-width:300px;text-align:center;font-family:monospace";
				const title = document.createElement("div");
				title.style.cssText = "font-weight:bold;margin-bottom:12px;font-size:14px";
				title.textContent = "Solving Turnstile...";
				const status = document.createElement("div");
				status.style.cssText = "font-size:11px;color:#666;margin:10px 0";
				status.textContent = "Rendering...";
				const ctnr = document.createElement("div");
				ctnr.style.margin = "16px 0";
				const cancelBtn = document.createElement("button");
				cancelBtn.textContent = "Cancel";
				cancelBtn.style.cssText = "border:none;background:#e53935;color:#fff;cursor:pointer;padding:6px 16px;border-radius:6px;margin-top:8px";
				box.append(title, ctnr, status, cancelBtn);
				document.body.append(overlay, box);

				let done = false;
				const finish = (msg) => {
					if (done) return;
					done = true;
					overlay.remove();
					box.remove();
					resolve(msg);
				};
				cancelBtn.onclick = () => finish("Dibatalkan.");
				const timer = setTimeout(() => finish("Timeout."), 120000);

				try {
					window.turnstile.render(ctnr, {
						sitekey: last.sitekey,
						action: last.action || undefined,
						theme: "light",
						callback: (token) => {
							clearTimeout(timer);
							status.innerHTML = "<span style=\"color:green\">✓ Success!</span>";
							self.autoDownload({
								host: location.hostname,
								solvedAt: new Date().toISOString(),
								sitekey: last.sitekey,
								token
							});
							setTimeout(() => finish("TOKEN:\n" + token), 800);
						},
						"error-callback": (err) => {
							clearTimeout(timer);
							setTimeout(() => finish("ERROR: " + err), 1500);
						},
					});
				} catch (e) {
					clearTimeout(timer);
					finish("EXCEPTION: " + e.message);
				}
			});
		},

		clear() {
			this.captured = [];
			return "Cleared.";
		}
	});


})();
