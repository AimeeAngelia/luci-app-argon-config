const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('htdocs/luci-static/resources/view/argon-config-app.js', 'utf8');

function loadView(writable = true) {
	const state = { notifications: [], removed: [], calls: [], options: [], files: [], uploads: [], rows: [] };
	function E(tag, attrs, children) {
		if (arguments.length < 3 && (Array.isArray(attrs) || typeof attrs === 'string' || attrs?.tag)) {
			children = attrs; attrs = {};
		}
		return { tag, attrs: attrs || {}, children, textContent: '' };
	}
	class Map {
		section(type, config) {
			assert.equal(config, 'global');
			return {
				tab() {},
				taboption(tab, type, name) {
					const option = { name, tab, value() {}, depends() {} };
					state.options.push(option);
					return option;
				}
			};
		}
		render() { return Promise.resolve(E('form')); }
	}
	const context = vm.createContext({
		E, console, Date, Promise, Math,
		_: text => text,
		cbi_update_table(table, rows) { state.rows = rows; },
		L: {
			bind: (fn, ctx) => fn.bind(ctx), hasViewPermission: () => writable,
			resource: path => '/luci-static/resources/' + path
		},
		view: { extend: obj => obj },
		form: { Map, TypedSection: 'TypedSection', ListValue: 'ListValue', Value: 'Value' },
		uci: { load: async () => { state.loaded = true; } },
		fs: {
			list: async () => { if (state.listError) throw state.listError; return state.files; },
			remove: async path => state.removed.push(path)
		},
		rpc: { declare: spec => async (...args) => {
			state.calls.push({ method: spec.method, args });
			if (state.rpcError) throw state.rpcError;
			return spec.method === 'avail' ? { avail: 1024 } : { result: state.result ?? 0 };
		} },
		ui: {
			addNotification: (title, content, level) => state.notifications.push({ content, level }),
			uploadFile: async path => { state.uploads.push(path); if (state.uploadError) throw state.uploadError; return state.upload; },
			showModal: (title, children) => { state.modal = { title, children }; },
			hideModal: () => { state.modal = null; },
			createHandlerFn: (ctx, fn, ...args) => (...rest) => (typeof fn === 'string' ? ctx[fn] : fn).apply(ctx, [...args, ...rest])
		}
	});
	vm.runInContext('String.prototype.format = function(...args) { let i=0; return this.replace(/%s|%1024\\.2mB/g, () => String(args[i++])); };', context);
	state.view = vm.runInContext('(function() {\n' + source + '\n})()', context);
	state.render = async () => state.view.render(await state.view.load());
	return state;
}

function buttons(node, out = []) {
	if (!node || typeof node !== 'object') return out;
	if (node.tag === 'button') out.push(node);
	for (const child of Array.isArray(node.children) ? node.children : [node.children]) buttons(child, out);
	return out;
}

test('settings use LuCI footer actions and validate HEX colors', async () => {
	const s = loadView(); const page = await s.render();
	assert.equal(buttons(page).find(b => b.children === 'Upload background').attrs.disabled, null);
	assert.equal(Object.hasOwn(s.view, 'handleSaveApply'), false);
	assert.equal(Object.hasOwn(s.view, 'handleSave'), false);
	assert.equal(Object.hasOwn(s.view, 'handleReset'), false);
	const color = s.options.find(o => o.name === 'primary');
	for (const value of ['#fff', '#A1b2C3']) assert.equal(color.validate('global', value), true);
	for (const value of ['red', '#ffff', '#ffffff;background:red']) assert.notEqual(color.validate('global', value), true);
	assert.equal(s.options.some(o => o.name.startsWith('_')), false);
});

test('missing background directory renders empty, permission errors remain visible', async () => {
	const s = loadView(); s.listError = Object.assign(new Error('missing'), { name: 'NotFoundError' });
	await s.render(); assert.equal(s.rows.length, 0);
	s.listError = new Error('permission denied');
	await assert.rejects(s.view.load(), /permission denied/);
});

test('upload publishes once, refreshes in place and cleans its unique staging file', async () => {
	const s = loadView(); await s.render(); s.upload = { name: '日落 & sky.JPG' };
	await s.view.handleUpload();
	const publish = s.calls.find(c => c.method === 'install');
	assert.match(publish.args[0], /^\/tmp\/argon-config-upload-[0-9a-f]{16,64}$/);
	assert.equal(publish.args[1], s.upload.name);
	assert.equal(s.removed[0], publish.args[0]);
	assert.equal(s.notifications[0].level, 'info');
	await s.view.handleUpload();
	assert.notEqual(s.uploads[0], s.uploads[1]);
});

test('unsupported uploads and backend failures show errors without reporting success', async () => {
	const s = loadView(); await s.render(); s.upload = { name: 'script.html' };
	await s.view.handleUpload();
	assert.equal(s.calls.some(c => c.method === 'install'), false);
	assert.equal(s.notifications[0].level, 'error');
	assert.equal(s.removed.length, 1);
	s.upload = { name: 'sky.png' }; s.result = 4;
	await s.view.handleUpload();
	assert.match(s.notifications[1].content.children, /already exists/);
	assert.equal(s.notifications.every(n => n.level === 'error'), true);
});

test('cancelled upload leaves no error banner', async () => {
	const s = loadView(); s.uploadError = new Error('Upload has been cancelled');
	await s.view.handleUpload();
	assert.equal(s.notifications.length, 0);
});

test('delete requires confirmation and preserves the dialog on failure', async () => {
	const s = loadView(); await s.render();
	s.view.handleDelete({ name: 'sky.png' });
	assert.equal(s.calls.some(c => c.method === 'remove'), false);
	let confirm = buttons({ children: s.modal.children }).find(b => b.children === 'Delete');
	s.result = 5; await confirm.attrs.click();
	assert.ok(s.modal); assert.equal(s.notifications[0].level, 'error');
	s.result = 0; await confirm.attrs.click(); assert.equal(s.modal, null);
});

test('file list filters unsafe entries and previews an encoded media URL', async () => {
	const s = loadView(); await s.render();
	s.view.renderFiles([
		{ name: 'z.mp4', type: 'file', mtime: 1, size: 1 },
		{ name: 'a #1.png', type: 'file', mtime: 2, size: 1 },
		{ name: '.hidden.png', type: 'file' }, { name: 'dir.png', type: 'directory' },
		{ name: 'symlink.png', type: 'link' }, { name: 'x.html', type: 'file' }
	]);
	assert.equal(s.rows.length, 2); assert.equal(s.rows[0][0], 'a #1.png');
	s.view.handlePreview({ name: 'a #1.png', mtime: 2 });
	assert.equal(s.modal.children[0].tag, 'img');
	assert.equal(new URL(s.modal.children[0].attrs.src, 'http://router').pathname, '/luci-static/argon/background/a%20%231.png');
	s.view.handlePreview({ name: 'z.mp4', mtime: 1 });
	assert.equal(s.modal.children[0].tag, 'video');
});

test('read-only users can preview but cannot use upload or delete buttons', async () => {
	const s = loadView(false); const page = await s.render();
	assert.equal(buttons(page).find(b => b.children === 'Upload background').attrs.disabled, true);
	s.view.renderFiles([{ name: 'a.png', type: 'file', mtime: 1, size: 1 }]);
	const row = buttons(s.rows[0][3]);
	assert.equal(row.find(b => b.children === 'Delete').attrs.disabled, true);
	assert.notEqual(row.find(b => b.children === 'Preview').attrs.disabled, true);
});

test('mutating RPC calls belong exclusively to the write ACL', () => {
	const acl = JSON.parse(fs.readFileSync('root/usr/share/rpcd/acl.d/luci-app-argon-config-standalone.json'))['luci-app-argon-config-standalone'];
	assert.deepEqual(acl.read.ubus['luci.argon_config'], ['avail']);
	assert.deepEqual(acl.write.ubus['luci.argon_config'], ['install', 'remove']);
	assert.deepEqual(Object.keys(acl.write.file), ['/tmp/argon-config-upload-*']);
});
