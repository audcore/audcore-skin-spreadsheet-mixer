import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createMockAudcore } from "./support/mock-audcore.mjs";

class Element {
    constructor() {
      this.children = [];
      this.attributes = {};
      this.events = {};
      this.style = { setProperty(name, value) { this[name] = value; } };
    }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    insertBefore(node, before) {
      if (node.parent) node.remove();
      node.parent = this;
      const index = before ? this.children.indexOf(before) : -1;
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
    }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    toggleAttribute(name, enabled) { if (enabled) this.setAttribute(name, ""); else this.removeAttribute(name); }
    get parentElement() { return this.parent; }
    closest(selector) {
      const attribute = selector.match(/^\[([\w-]+)\]$/)?.[1];
      if (!attribute) return null;
      if (this.getAttribute(attribute) !== null) return this;
      return this.parent?.closest(selector) ?? null;
    }
    focus() { if (globalThis.document) globalThis.document.activeElement = this; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type, handler) { this.events[type] = handler; }
    getBoundingClientRect() { return { left: 12, bottom: 34 }; }
}

// Exercise the actual page module without starting or controlling a GUI.

test("Sheet lays out channels as columns and keeps rack order authoritative", async () => {
  class SheetElement extends Element {
    prepend(...nodes) { for (const node of nodes.reverse()) this.insertBefore(node, this.children[0]); }
    get lastElementChild() { return this.children.at(-1); }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    closest(selector) {
      if (selector === "[data-effect-instance], .channel") {
        if (this.className === "channel" || this.getAttribute("data-effect-instance") !== null) return this;
        return this.parent?.closest(selector) ?? null;
      }
      return super.closest(selector);
    }
    select() {}
    scrollIntoView(options) { this.scrolled = options; }
    setPointerCapture() {}
    getContext() {
      this.trace = [];
      let points;
      return {
        clearRect: () => { this.trace.length = 0; },
        beginPath: () => { points = []; },
        moveTo: (x, y) => points.push([x, y]),
        lineTo: (x, y) => points.push([x, y]),
        stroke: () => this.trace.push(points)
      };
    }
    blur() {
      document.activeElement = null;
      this.events.blur?.();
    }
  }
  const markup = await readFile(new URL("../web/matrix.html", import.meta.url), "utf8");
  const nodes = Object.fromEntries([...markup.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, new SheetElement()]));
  const html = new SheetElement();
  html.setAttribute("data-skin", "matrix");
  const channels = [
    { id: 7, name: "Mic", chain_uuid: "mic", displayColor: "#123456", rack: [{ instance: 11, name: "EQ", alias: "Tone" }, { instance: 12, name: "Comp" }],
      sends: [{ dest: { kind: "chain", id: 2 }, level_db: 0 }, { dest: { kind: "output", pair: 0 }, level_db: -3 }] },
    { id: 2, name: "Bus", chain_uuid: "bus", channel_mode: 1, align_right: true, rack: [], sends: [] }
  ];
  const recordingChoices = ["tap:0", "tap:1", "tap:2"];
  const mock = createMockAudcore({
    channels, channelLabels: {7:"Mic",2:"Bus"}, graph: { chains: channels, output_pairs: [0] },
    inputLabels: { 7: "Analog In 1 (USB Interface)", 2: "VIRTUAL REC 1/2" },
    outputLabels: { 0: { stereo: "Analog Out 1/2 (USB Interface)" } }, outputReasons: { 0: "Unplugged" }, appearance: { theme: "dark", scale: 1 }
  }, { async showMenu() { return recordingChoices.shift(); } });
  const menus = [];
  let openedEditors = 0;
  const host = { ...mock, menu: {
    ...mock.menu,
    async openChannelSettings(...args) { menus.push(["channel", ...args]); },
    async openSendPrimary(...args) { menus.push(["output", ...args]); },
    async openAddSend(...args) { menus.push(["add-send", ...args]); },
    async openShortcut(...args) { menus.push(["shortcut", ...args]); }
  }, effect: {
    ...mock.effect,
    async openEditor() { openedEditors++; },
    async openBrowser(...args) { menus.push(["effects", ...args]); }
  } };
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const byClass = (row, name) => row.children.find(child => child.className === name);
  const control = (row, name) => row.children.find(child => child.getAttribute("data-control") === name);
  const event = { preventDefault() {}, stopPropagation() {}, currentTarget: null };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const windowEvents = new Map();
  const widths = new Map();
  let hit;
  const fire = (name, data) => {
    for (const listener of [...(windowEvents.get(name) ?? [])]) listener(data);
  };
  try {
    globalThis.window = {
      audcore: host, localStorage: { getItem: key => widths.get(key), setItem: (key, value) => widths.set(key, value) },
      addEventListener(name, listener) {
        if (!windowEvents.has(name)) windowEvents.set(name, new Set());
        windowEvents.get(name).add(listener);
      },
      removeEventListener(name, listener) { windowEvents.get(name)?.delete(listener); }
    };
    globalThis.document = {
      hidden: false, documentElement: html, getElementById: id => nodes[id], createElement: () => new SheetElement(),
      addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], elementFromPoint: () => hit
    };
    await import("../web/page.mjs?sheet-test");
    assert.equal(nodes.settings.textContent, undefined);
    const theme = nodes["table-theme"];
    assert.equal(theme.disabled, false);
    theme.events.click();
    await settle();
    assert.equal(html.getAttribute("data-theme"), "light");
    theme.events.click();
    await settle();
    assert.equal(html.getAttribute("data-theme"), "dark");
    assert.equal(nodes.transport.textContent, undefined);
    mock.fixture.update("transport", { playing: true });
    assert.equal(nodes.transport.getAttribute("aria-pressed"), "true");
    assert.equal(nodes.transport.textContent, undefined);
    const [mic, bus] = nodes.channels.children;
    const rec = control(mic, "recording");
    assert.equal(rec.textContent, "REC fader");
    for (const expected of ["REC Pre FX", "REC Post FX", "REC fader"]) {
      await mock.menu.openRecording(7, { x: 0, y: 0 });
      assert.equal(rec.textContent, expected);
    }
    assert.equal(byClass(mic, "input").textContent, "In 1");
    assert.equal(byClass(mic, "input").title, "Analog In 1 (USB Interface)");
    assert.equal(byClass(bus, "input").textContent, "Rec 1/2");
    const viewport = nodes["table-viewport"];
    const scroll = nodes["table-scroll-x"], vertical = nodes["table-scroll-y"];
    viewport.scrollWidth = 680;
    viewport.clientWidth = 440;
    viewport.scrollLeft = 31;
    viewport.scrollHeight = 700;
    viewport.clientHeight = 400;
    viewport.scrollTop = 20;
    viewport.events.scroll();
    assert.equal(scroll.max, "240");
    assert.equal(scroll.disabled, false);
    assert.equal(scroll.value, "31");
    assert.equal(scroll.getAttribute("data-scrolling"), "");
    assert.equal(vertical.value, "20");
    assert.equal(vertical.getAttribute("data-scrolling"), "");
    scroll.value = "90";
    scroll.events.input();
    assert.equal(viewport.scrollLeft, 90);
    assert.equal(mic.children.at(-1), control(mic, "mute"));
    assert.equal(bus.children.at(-1), control(bus, "mute"));
    assert.deepEqual(nodes.channels.children.map(row => byClass(row, "table-index").children[0].textContent), ["8", "3"]);
    assert.equal(mic.style["--channel-color"], "#123456");
    assert.equal(mic.style["--table-name-ink"], "#fff");
    assert.equal(html.getAttribute("data-theme"), "dark");
    const sends = byClass(byClass(mic, "table-stack table-send-stack"), "sends");
    const sendText = send => [send.children[0].textContent, send.children[1].lastElementChild.textContent];
    assert.deepEqual(sends.children.slice(0, 2).map(sendText), [["Bus", "0.0"], ["Out 1/2", "-3.0"]]);
    const channelSend = sends.children[0];
    assert.equal(channelSend.getAttribute("data-send-channel"), "");
    assert.equal(channelSend.style["--table-send-color"], bus.style["--channel-color"]);
    assert.equal(sends.children[1].getAttribute("data-send-channel"), null);
    mock.fixture.update("channels", mock.fixture.snapshot().state.channels.map(channel =>
      channel.id === 2 ? { ...channel, displayColor: "#332255" } : channel));
    assert.equal(channelSend.style["--table-send-color"], "#332255");
    assert.equal(channelSend.style["--table-send-ink"], "#fff");
    assert.equal(sends.children[1].events.wheel, undefined);
    sends.children[1].events.keydown({ ...event, key: "ArrowUp" });
    await settle();
    assert.deepEqual(sendText(sends.children[1]), ["Out 1/2", "-2.9"]);
    assert.equal(sends.children.length, 6);
    assert.ok(sends.children.slice(2).every(cell => cell.getAttribute("data-empty") === "true"));
    const busSends = byClass(byClass(bus, "table-stack table-send-stack"), "sends");
    assert.equal(busSends.children[0].getAttribute("data-empty"), "true");
    assert.equal(sends.children[1].title, "Analog Out 1/2 (USB Interface) -2.9\nUnplugged");
    assert.equal(byClass(mic, "table-output"), undefined);
    assert.ok(mic.children.every(cell => cell.type !== "range"));

    const width = "--table-column-width";
    assert.equal(nodes["skin-root"].style["--table-label-width"], "100px");
    assert.equal(mic.style[width], "76px");
    assert.equal(bus.style[width], "76px");
    const handle = byClass(byClass(mic, "table-index"), "table-resize");
    handle.events.pointerdown({ ...event, button: 0, pointerId: 1, clientX: 200 });
    handle.events.pointermove({ ...event, pointerId: 1, clientX: 235 });
    handle.events.pointerup({ ...event, pointerId: 1, clientX: 235 });
    assert.equal(mic.style[width], "111px");
    assert.equal(bus.style[width], "76px");
    assert.equal(widths.get("audcore.sheet.width:channel:mic"), "111");
    handle.events.keydown({ ...event, key: "Home" });
    assert.equal(mic.style[width], "76px");
    assert.equal(nodes["table-rows"].getAttribute("data-effect-rows"), "10");
    assert.equal(nodes["table-rows"].getAttribute("data-send-rows"), "6");
    const effectStack = byClass(mic, "table-stack table-effect-stack");
    const rack = byClass(effectStack, "effects");
    assert.equal(rack.children.length, 10);
    assert.equal(rack.children[0].events.wheel, undefined);
    const fx = control(mic, "fx");
    assert.equal(mic.children[mic.children.indexOf(effectStack) - 1], fx);
    assert.deepEqual(effectStack.children, [rack]);
    fx.events.click(event);
    await settle();
    assert.equal(fx.getAttribute("aria-pressed"), "true");
    assert.equal(rack.getAttribute("inert"), "");
    assert.equal(control(bus, "fx").getAttribute("aria-pressed"), "false");
    assert.equal(rack.children[0].getAttribute("data-bypass"), "false");
    fx.events.click(event);
    await settle();
    assert.equal(rack.getAttribute("inert"), null);
    assert.ok(byClass(byClass(bus, "table-stack table-effect-stack"), "effects").children.every(cell => cell.getAttribute("data-empty") === "true"));

    const search = nodes["table-search"];
    const query = value => {
      search.value = value;
      search.events.input();
    };
    query(" ｍＩＣ ");
    assert.equal(mic.getAttribute("data-search-match"), "");
    assert.equal(bus.getAttribute("data-search-match"), null);
    assert.equal(rack.children[0].getAttribute("data-search-match"), null);
    await mock.channel.setName(7, "Voice");
    mock.fixture.update("channelLabels", {7:"Voice",2:"Bus"});
    assert.equal(mic.getAttribute("data-search-match"), null);
    query("３");
    assert.equal(bus.getAttribute("data-search-match"), "");
    await mock.channel.setHidden(2, true);
    assert.equal(bus.getAttribute("data-search-match"), null);
    await mock.channel.setHidden(2, false);
    assert.equal(bus.getAttribute("data-search-match"), "");
    query("tone");
    assert.equal(rack.children[0].getAttribute("data-search-match"), "");
    query("eq");
    assert.equal(mic.getAttribute("data-search-match"), null);
    assert.equal(rack.children[0].getAttribute("data-search-match"), "");
    assert.equal(rack.children[2].getAttribute("data-search-match"), null);
    search.events.keydown({ ...event, key: "Enter" });
    assert.deepEqual(rack.children[0].scrolled, { block: "nearest", inline: "nearest" });
    const effectPointer = { ...event, pointerId: 3, button: 0, clientX: 126, clientY: 142 };
    const overEffect = { ...effectPointer, clientY: 226 };
    const startEffectDrag = (source, target) => {
      hit = target.children[0];
      source.children[1].events.pointerdown(effectPointer);
      fire("pointermove", overEffect);
      assert.equal(target.getAttribute("data-drop-target"), "true");
    };
    const firstEffect = rack.children[0];
    const emptyEffect = rack.children[4];
    startEffectDrag(firstEffect, emptyEffect);
    fire("pointercancel", { ...overEffect, type: "pointercancel" });
    assert.equal(emptyEffect.getAttribute("data-drop-target"), null);
    assert.equal(rack.children[0], firstEffect);
    startEffectDrag(firstEffect, emptyEffect);
    fire("pointerup", { ...overEffect, type: "pointerup" });
    firstEffect.events.click({ detail: 1 });
    await settle();
    assert.equal(openedEditors, 0);
    assert.deepEqual(mock.fixture.snapshot().state.graph.chains[0].rack.map(effect => effect.instance), [12, 11]);
    assert.equal(rack.children[4].getAttribute("data-effect-instance"), "11");
    assert.equal(rack.children[4].getAttribute("data-search-match"), "");
    search.events.keydown({ ...event, key: "Escape" });
    assert.equal(search.value, "");
    assert.equal(rack.children[4].getAttribute("data-search-match"), null);
    search.focus();
    search.events.keydown({ ...event, key: "Escape" });
    assert.equal(document.activeElement, null);
    assert.equal(rack.children[0].getAttribute("data-empty"), "true");
    nodes["table-add-effect-row"].events.click(event);
    nodes["table-add-send-row"].events.click(event);
    assert.equal(rack.children.length, 11);
    assert.equal(nodes["table-rows"].getAttribute("data-send-rows"), "7");
    assert.equal(sends.children.length, 7);
    sends.children[6].events.click(event);
    busSends.children[0].events.click(event);
    rack.children[10].children[0].events.click(event);
    sends.children[1].events.keydown({ ...event, key: "Enter" });
    control(mic, "shortcut").events.click(event);
    assert.deepEqual(menus.map(([name, id]) => [name, id]), [["add-send", 7], ["add-send", 2], ["effects", 7], ["output", 7], ["shortcut", 7]]);
    assert.equal(menus[3][2], 1);
    const removeFx = nodes["table-remove-effect-row"];
    const removeSend = nodes["table-remove-send-row"];
    removeFx.events.click({ ...event, currentTarget: removeFx });
    removeSend.events.click({ ...event, currentTarget: removeSend });
    assert.equal(rack.children.length, 10);
    assert.equal(nodes["table-rows"].getAttribute("data-send-rows"), "6");
    for (let i = 0; i < 6; i++) removeFx.events.click({ ...event, currentTarget: removeFx });
    assert.equal(rack.children.length, 5);
    assert.equal(removeFx.disabled, true);
    assert.equal(rack.children[4].getAttribute("data-effect-instance"), "11");
    const movedEffect = rack.children[4];
    startEffectDrag(movedEffect, rack.children[1]);
    fire("pointerup", { ...overEffect, type: "pointerup" });
    await settle();
    assert.deepEqual(mock.fixture.snapshot().state.graph.chains[0].rack.map(effect => effect.instance), [11, 12]);
    rack.children[0].children[1].events.pointerdown(effectPointer);
    fire("pointerup", { ...effectPointer, type: "pointerup" });
    rack.children[0].events.click({ detail: 1 });
    assert.equal(openedEditors, 1);

    const gain = control(mic, "value");
    gain.focus();
    gain.events.focus();
    gain.value = "−9,5";
    gain.events.keydown({ ...event, key: "Enter" });
    await settle();
    assert.equal(mock.fixture.snapshot().state.channels[0].gainDb, -9.5);
    assert.equal(gain.events.wheel, undefined);
    gain.events.pointerdown({ ...event, button: 0, pointerId: 2, clientX: 100 });
    fire("pointermove", { ...event, pointerId: 2, clientX: 114 });
    fire("pointerup", { ...event, pointerId: 2 });
    await settle();
    assert.equal(gain.value, "-8.1");
    assert.equal(mock.fixture.snapshot().state.channels[0].gainDb, -8.1);
    mock.fixture.publishMeters([{ id: 7, peak: 1, peak_l: 1, peak_r: .2 }, { id: 2, peak: .5 }]);
    const canvas = channel => byClass(byClass(channel, "table-trace"), "meter").children[0];
    assert.deepEqual(canvas(mic).trace.map(points => points.length), [96, 96]);
    assert.deepEqual(canvas(bus).trace.map(points => points.length), [96]);
    const previousLeft = canvas(mic).trace[0].at(-1)[1];
    mock.fixture.publishMeters([{ id: 7, peak: 0.25, peak_l: 0.1, peak_r: 0.25 }]);
    assert.equal(canvas(mic).trace[0].at(-2)[1], previousLeft);
    assert.ok(canvas(mic).trace[0].at(-1)[1] > previousLeft);
    assert.ok(canvas(mic).trace[1].at(-1)[1] >= 16);
    control(mic, "mute").events.click(event);
    control(mic, "solo").events.click(event);
    await settle();
    assert.equal(mock.fixture.snapshot().state.channels[0].muted, true);
    assert.equal(mic.getAttribute("data-muted"), "");
    assert.equal(mock.fixture.snapshot().state.channels[0].solo, true);
    const current = mock.fixture.snapshot().state;
    const sidechainSend = { dest: { kind: "sidechain", instance: 11 }, level_db: -60 };
    const withSidechain = entries => entries.map(channel =>
      channel.id === 2 ? { ...channel, sends: [sidechainSend] } : channel);
    mock.fixture.patch({ channels: withSidechain(current.channels),
      graph: { ...current.graph, chains: withSidechain(current.graph.chains) },
      sidechainLabels: { 11: "侧链 伴奏融合" } });
    assert.deepEqual(sendText(busSends.children[0]), ["伴奏融合", "-60.0"]);
    assert.equal(busSends.children[0].title, "侧链 伴奏融合 -60.0");
    const title = byClass(mic, "name");
    const pointer = { ...event, pointerId: 10, button: 0, clientX: 150, clientY: 64 };
    const overBus = { ...pointer, clientX: 250 };
    hit = byClass(bus, "name");
    title.events.pointerdown(pointer);
    title.events.pointermove(overBus);
    assert.equal(bus.getAttribute("data-channel-drop-target"), "");
    title.events.pointercancel({ ...overBus, type: "pointercancel" });
    assert.deepEqual(nodes.channels.children, [mic, bus]);
    assert.equal(bus.getAttribute("data-channel-drop-target"), null);
    title.events.pointerdown(pointer);
    title.events.pointermove(overBus);
    title.events.pointerup({ ...overBus, type: "pointerup" });
    title.events.click({ detail: 1 });
    await settle();
    assert.deepEqual(nodes.channels.children, [bus, mic]);
    assert.deepEqual(mock.fixture.snapshot().state.channels.map(channel => channel.id), [2, 7]);
    assert.ok(!menus.some(([action]) => action === "channel"));
    title.events.pointerdown(pointer);
    title.events.pointerup({ ...pointer, type: "pointerup" });
    title.events.click({ detail: 1 });
    assert.equal(menus.at(-1)[0], "channel");
    // Remove the reverse route before offering the sidechain and channel.
    const routed = mock.fixture.snapshot().state;
    const clearReverse = entries => entries.map(channel => channel.id === 2 ? { ...channel, sends: [] } : channel);
    mock.fixture.patch({ channels: clearReverse(routed.channels), graph: { ...routed.graph, chains: clearReverse(routed.graph.chains) } });
    await mock.channel.removeSend(7, 0);
    const empty = sends.children[1];
    hit = byClass(bus, "name");
    empty.events.pointerdown(pointer);
    empty.events.pointermove(overBus);
    assert.equal(bus.getAttribute("data-send-hover"), "");
    empty.events.pointerup({ ...overBus, type: "pointerup" });
    const menuCount = menus.length;
    empty.events.click({ detail: 1 });
    assert.equal(menus.length, menuCount);
    assert.deepEqual(mock.fixture.snapshot().state.channels.find(channel => channel.id === 7).sends.at(-1).dest, { kind: "chain", id: 2 });
    assert.equal(bus.getAttribute("data-send-hover"), null);
    fire("pagehide", { persisted: true });
    assert.equal(scroll.getAttribute("data-scrolling"), null);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
