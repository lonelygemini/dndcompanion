const LS_KEY = "dm_notes_html_v1";

const SECTIONS = [
  { key:"story",     label:"Story"     },
  { key:"sessions",  label:"Sessions"  },
  { key:"quests",    label:"Quests"    },
  { key:"npcs",      label:"NPCs"      },
  { key:"locations", label:"Locations" },
  { key:"items",     label:"Items"     },
  { key:"lore",      label:"Lore"      },
];

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs={}) => {
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "value") n.value = v;
    else if (k === "style") n.style.cssText = v;
    else n.setAttribute(k, v);
  }
  return n;
};

const nowISO = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);

const slugify = (title) =>
  title.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g,"")
    .replace(/\s+/g,"-")
    .replace(/-+/g,"-")
    .slice(0,64);

function extractLinks(text){
  const re = /\[\[([^\]]+)\]\]/g;
  const out = new Set();
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[1].trim());
  return [...out].filter(Boolean);
}

function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 1400);
}

function defaultData(){
  const d = {
    meta: { version:1, createdAt: nowISO(), updatedAt: nowISO() },
    settings: { campaignName:"Untitled Campaign", system:"D&D 5e" },
    items: {},
    orderBySection: Object.fromEntries(SECTIONS.map(s=>[s.key,[]])),
  };

  const seed = [
    { section:"story", title:"Campaign premise", tags:["hook"], content:
`A one paragraph pitch.

- Theme:
- Tone:
- Big bad:

Links: [[First session plan]] [[Town of Ashford]] [[Captain Merrow]]`},
    { section:"sessions", title:"First session plan", tags:["session"], content:
`Beats:
1) Cold open
2) Inciting incident
3) Choice point

Scene notes:
- NPC: [[Captain Merrow]]
- Location: [[Town of Ashford]]
- Quest: [[Missing lanterns]]`},
    { section:"npcs", title:"Captain Merrow", tags:["npc","guard"], content:
`Role: City watch captain
Wants: Order, respect
Secret: Owes money to the guild
Voice: clipped sentences

Hooks: Can offer [[Missing lanterns]] as a lead.`},
    { section:"locations", title:"Town of Ashford", tags:["town"], content:
`Smells like wet stone and smoked fish.

Notable places:
- The Split Oar
- Old lighthouse

People: [[Captain Merrow]]`},
    { section:"quests", title:"Missing lanterns", tags:["quest"], content:
`Problem: The lighthouse lanterns are being stolen.
Clues: Salt crystals, faint humming at night.
Twist: It's not theft, it's a ward being dismantled.

Leads:
- [[Captain Merrow]]
- [[Town of Ashford]]`},
    { section:"sessions", title:"Session 0 (template)", tags:["session"], content:
`Agenda:
- Safety tools
- Party connections
- House rules

Notes:

Next time:`},

{ section:"items", title:"Potion of Night-Glass", tags:["item","consumable"], content:
`Effect: Grants darkvision for 1 hour, but reflections whisper secrets.
Value: 150 gp
Hook: Sold by [[Captain Merrow]] (quietly).`},
  ];

  seed.forEach(s=>{
    const id = uid();
    d.items[id] = {
      id, section:s.section, title:s.title, slug:slugify(s.title),
      tags:s.tags, content:s.content,
      createdAt: nowISO(), updatedAt: nowISO(),
      pinned:false
    };
    d.orderBySection[s.section].unshift(id);
  });

  return d;
}

function loadData(){
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return defaultData();
  try{
    const parsed = JSON.parse(raw);
    if (!parsed?.meta?.version) return defaultData();
    return parsed;
  }catch{
    return defaultData();
  }
}

function saveData(d){
  d.meta.updatedAt = nowISO();
  localStorage.setItem(LS_KEY, JSON.stringify(d));
}

// State
let data = loadData();
let section = "sessions";
let selectedId = null;
let query = "";
let tagFilter = null;

// UI elements
const tabsEl = $("#tabs");
const listEl = $("#noteList");
const tagPillsEl = $("#tagPills");
const listTitleEl = $("#listTitle");
const listCountEl = $("#listCount");
const tagFilterLabelEl = $("#tagFilterLabel");
const editorAreaEl = $("#editorArea");
const updatedLabelEl = $("#updatedLabel");

function allItems(){
  return Object.values(data.items || {});
}

function allTags(){
  const s = new Set();
  allItems().forEach(it => (it.tags||[]).forEach(t => s.add(t)));
  return [...s].sort((a,b)=>a.localeCompare(b));
}

function itemsInSection(){
  const ids = data.orderBySection?.[section] || [];
  let items = ids.map(id=>data.items[id]).filter(Boolean);

  const q = query.trim().toLowerCase();
  items = items.filter(it=>{
    if (tagFilter && !(it.tags||[]).includes(tagFilter)) return false;
    if (!q) return true;
    return it.title.toLowerCase().includes(q)
      || (it.content||"").toLowerCase().includes(q)
      || (it.tags||[]).some(t=>t.toLowerCase().includes(q));
  });

  items.sort((a,b)=>
    (Number(b.pinned)-Number(a.pinned)) ||
    b.updatedAt.localeCompare(a.updatedAt)
  );

  return items;
}

function selected(){
  return selectedId ? data.items[selectedId] : null;
}

function ensureSelection(){
  const ids = data.orderBySection?.[section] || [];
  if (!selectedId || !data.items[selectedId] || data.items[selectedId].section !== section){
    selectedId = ids[0] || null;
  }
}

function commit(mutator){
  const clone = structuredClone(data);
  data = mutator(clone) || clone;
  saveData(data);
  render();
}

function createItem(sectionKey){
  commit(d=>{
    const id = uid();
    const base = "New note";
    const titles = new Set(Object.values(d.items).map(x=>x.title.toLowerCase()));
    let title = base; let n = 2;
    while (titles.has(title.toLowerCase())) title = base + " " + (n++);
    d.items[id] = {
      id, section: sectionKey, title, slug: slugify(title),
      tags: [], content:"",
      createdAt: nowISO(), updatedAt: nowISO(),
      pinned:false
    };
    d.orderBySection[sectionKey] = [id, ...(d.orderBySection[sectionKey]||[])];
    selectedId = id;
    toast("New note created");
    return d;
  });
}

function deleteItem(id){
  if (!id) return;
  const it = data.items[id];
  if (!it) return;
  commit(d=>{
    delete d.items[id];
    d.orderBySection[it.section] = (d.orderBySection[it.section]||[]).filter(x=>x!==id);
    selectedId = null;
    toast("Note deleted");
    return d;
  });
}

function updateSelected(patch){
  const it = selected();
  if (!it) return;
  commit(d=>{
    const cur = d.items[it.id];
    if (!cur) return d;
    d.items[it.id] = {
      ...cur,
      ...patch,
      updatedAt: nowISO(),
      slug: patch.title ? slugify(patch.title) : cur.slug
    };
    return d;
  });
}

function togglePin(){
  const it = selected();
  if (!it) return;
  updateSelected({ pinned: !it.pinned });
}

function setTagsFromString(s){
  const tags = s.split(",").map(x=>x.trim()).filter(Boolean).slice(0,24);
  updateSelected({ tags });
}

function jumpToTitle(title){
  const norm = title.trim().toLowerCase();
  const found = allItems().find(it => it.title.trim().toLowerCase() === norm);
  if (found){
    section = found.section;
    selectedId = found.id;
    toast("Jumped to link");
    render();
    return;
  }
  // create stub
  commit(d=>{
    const id = uid();
    d.items[id] = {
      id, section, title: title.trim(), slug: slugify(title.trim()),
      tags:["stub"],
      content:"(Made from a link, please work me out.)",
      createdAt: nowISO(), updatedAt: nowISO(),
      pinned:false
    };
    d.orderBySection[section] = [id, ...(d.orderBySection[section]||[])];
    selectedId = id;
    toast("Stub note created");
    return d;
  });
}

function backlinksFor(item){
  const target = item.title.trim().toLowerCase();
  const out = [];
  for (const it of allItems()){
    if (it.id === item.id) continue;
    const links = extractLinks(it.content||"").map(s=>s.toLowerCase());
    if (links.includes(target)) out.push(it);
  }
  out.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

function exportJSON(){
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dm-notes-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Export downloaded");
}

function importJSON(file){
  const r = new FileReader();
  r.onload = () => {
    try{
      const parsed = JSON.parse(String(r.result||""));
      if (!parsed?.items || !parsed?.orderBySection) throw new Error("bad");
      data = parsed;
      saveData(data);
      section = "sessions";
      selectedId = null;
      query = "";
      tagFilter = null;
      toast("Import successful");
      render();
    }catch{
      toast("Import failed");
    }
  };
  r.readAsText(file);
}

function resetDemo(){
  data = defaultData();
  saveData(data);
  section = "sessions";
  selectedId = null;
  query = "";
  tagFilter = null;
  toast("Reset to demo data");
  render();
}

// Renderers
function renderTabs(){
  tabsEl.innerHTML = "";
  SECTIONS.forEach(s=>{
    const b = el("button", { class:"tab" + (section===s.key ? " active":""), text:s.label });
    b.onclick = () => { section = s.key; selectedId = null; ensureSelection(); render(); };
    tabsEl.appendChild(b);
  });
}

function renderTags(){
  tagPillsEl.innerHTML = "";
  const tags = allTags();
  if (tags.length === 0){
    tagPillsEl.appendChild(el("div", { class:"mini muted", text:"No tags yet" }));
    return;
  }
  tags.slice(0, 28).forEach(t=>{
    const p = el("div", { class:"pill" + (tagFilter===t ? " active":""), text:t });
    p.onclick = () => { tagFilter = (tagFilter===t ? null : t); render(); };
    tagPillsEl.appendChild(p);
  });
}

function renderList(){
  const secLabel = SECTIONS.find(s=>s.key===section)?.label || section;
  listTitleEl.textContent = secLabel;

  tagFilterLabelEl.textContent = tagFilter ? "Filter: #" + tagFilter : "";

  const items = itemsInSection();
  listCountEl.textContent = items.length + " note(s)";
  listEl.innerHTML = "";

  if (items.length === 0){
    listEl.appendChild(el("div", { class:"hintBox", html:`No notes here yet. Click <b>New</b>.` }));
    return;
  }

  items.forEach(it=>{
    const btn = el("button", { class:"noteItem" + (it.id===selectedId ? " active":"" ) });
    btn.onclick = () => { selectedId = it.id; render(); };

    const title = el("div", { class:"noteTitle" });
    if (it.pinned) title.appendChild(el("span", { class:"pin", text:"📌" }));
    title.appendChild(el("span", { text: it.title }));

    const snip = el("div", { class:"snippet", text: (it.content||"(empty)") });

    const badgeRow = el("div", { class:"badgeRow" });
    (it.tags||[]).slice(0,4).forEach(t=> badgeRow.appendChild(el("span",{class:"badge",text:t})) );

    const meta = el("div", { class:"metaRow" });
    meta.appendChild(el("span", { text: new Date(it.updatedAt).toLocaleDateString() }));
    meta.appendChild(el("span", { text: "/" + it.slug }));

    btn.appendChild(title);
    btn.appendChild(snip);
    btn.appendChild(badgeRow);
    btn.appendChild(meta);

    listEl.appendChild(btn);
  });
}

function renderEditor(){
  const it = selected();
  editorAreaEl.innerHTML = "";

  if (!it){
    editorAreaEl.appendChild(el("div", { class:"hintBox", html:"Select a note, or click <b>New</b>." }));
    updatedLabelEl.textContent = "";
    return;
  }

  updatedLabelEl.textContent = "Updated " + new Date(it.updatedAt).toLocaleString();

  const top = el("div", { class:"editorTop" });
  const left = el("div", { class:"left" });

  const titleInput = el("input", { class:"input", value: it.title });
  titleInput.addEventListener("input", (e) => {
  const cur = data.items[it.id];
  if (!cur) return;
  cur.title = e.target.value;
  cur.slug = slugify(cur.title);
  cur.updatedAt = nowISO();
  saveData(data);
  updatedLabelEl.textContent = "Updated " + new Date(cur.updatedAt).toLocaleString();
});

// update list + slug display when you leave the field
titleInput.addEventListener("blur", () => render());

  left.appendChild(titleInput);

  const smallMeta = el("div", { class:"mini muted", style:"margin-top:8px;" });
  smallMeta.innerHTML = `<span class="muted">slug</span> <span class="k">/${it.slug}</span> • <span class="muted">created</span> <span class="k">${new Date(it.createdAt).toLocaleDateString()}</span>`;
  left.appendChild(smallMeta);

  const actions = el("div", { class:"row" });
  const pinBtn = el("button", { class:"btn small", text: it.pinned ? "Unpin" : "Pin" });
  pinBtn.onclick = togglePin;

  const delBtn = el("button", { class:"btn small danger", text:"Delete" });
  delBtn.onclick = ()=> deleteItem(it.id);

  actions.appendChild(pinBtn);
  actions.appendChild(delBtn);

  top.appendChild(left);
  top.appendChild(actions);

  const tagsLabel = el("div", { class:"mini muted strong", style:"margin-top:12px;", text:"Tags (comma-separated)" });
  const tagsInput = el("input", { class:"input", value:(it.tags||[]).join(", "), placeholder:"npc, quest, clue" });
  tagsInput.addEventListener("input", (e) => {
  const cur = data.items[it.id];
  if (!cur) return;

  cur.tags = e.target.value
    .split(",")
    .map(x => x.trim())
    .filter(Boolean)
    .slice(0, 24);

  cur.updatedAt = nowISO();
  saveData(data);
  updatedLabelEl.textContent = "Updated " + new Date(cur.updatedAt).toLocaleString();
});

tagsInput.addEventListener("blur", () => render());


  const divider = el("div", { class:"divider" });

  const textarea = el("textarea", { class:"textarea", placeholder:"Write here...\\n\\nTip: link with [[Title]]" });
  textarea.value = it.content || "";
  textarea.addEventListener("input", (e) => {
  const cur = data.items[it.id];
  if (!cur) return;

  cur.content = e.target.value;
  cur.updatedAt = nowISO();
  saveData(data);
  updatedLabelEl.textContent = "Updated " + new Date(cur.updatedAt).toLocaleString();
});

// refresh snippets + links/backlinks after editing
textarea.addEventListener("blur", () => render());


  // Links panel
  const linksDivider = el("div", { class:"divider" });
  const linksTitle = el("div", { class:"row space" });
  linksTitle.appendChild(el("div",{ class:"headTitle", text:"Links" }));
  linksTitle.appendChild(el("div",{ class:"mini muted", html:`Use <span class="k">[[Title]]</span>` }));

  const outgoing = extractLinks(it.content||"");
  const backs = backlinksFor(it);

  const linksGrid = el("div", { class:"rightCols", style:"margin-top:10px;" });

  const outgoingCard = el("div", { class:"hintBox" });
  outgoingCard.innerHTML = `<b>Outgoing</b> <span class="muted">(${outgoing.length})</span><div style="height:10px;"></div>`;
  if (outgoing.length === 0){
    outgoingCard.appendChild(el("div",{ class:"mini muted", text:"No links yet." }));
  } else {
    const wrap = el("div",{ class:"row wrap" });
    outgoing.forEach(t=>{
      const b = el("button",{ class:"linkBtn", text:t });
      b.onclick = ()=> jumpToTitle(t);
      wrap.appendChild(b);
    });
    outgoingCard.appendChild(wrap);
  }

  const backCard = el("div", { class:"hintBox" });
  backCard.innerHTML = `<b>Backlinks</b> <span class="muted">(${backs.length})</span><div style="height:10px;"></div>`;
  if (backs.length === 0){
    backCard.appendChild(el("div",{ class:"mini muted", text:"Nothing links here yet." }));
  } else {
    backs.forEach(bi=>{
      const b = el("button",{ class:"noteItem", style:"margin-top:8px;" });
      b.onclick = ()=> { section = bi.section; selectedId = bi.id; render(); };
      b.appendChild(el("div",{ class:"noteTitle", text: bi.title }));
      b.appendChild(el("div",{ class:"snippet", text: bi.content || "" }));
      backCard.appendChild(b);
    });
  }

  linksGrid.appendChild(outgoingCard);
  linksGrid.appendChild(backCard);

  editorAreaEl.appendChild(top);
  editorAreaEl.appendChild(tagsLabel);
  editorAreaEl.appendChild(tagsInput);
  editorAreaEl.appendChild(divider);
  editorAreaEl.appendChild(textarea);
  editorAreaEl.appendChild(linksDivider);
  editorAreaEl.appendChild(linksTitle);
  editorAreaEl.appendChild(linksGrid);
}

function renderHeader(){
  const nameInput = $("#campaignNameInput");

  nameInput.value = data.settings?.campaignName || "Untitled Campaign";
  $("#systemName").textContent = data.settings?.system || "System";
}


function render(){
  ensureSelection();
  renderHeader();
  renderTabs();
  renderTags();
  renderList();
  renderEditor();
}

// Wire up
$("#newBtn").onclick = ()=> createItem(section);

$("#searchInput").addEventListener("input", (e)=>{
  query = e.target.value || "";
  render();
});

$("#campaignNameInput").addEventListener("input", (e) => {
  data.settings.campaignName = e.target.value || "Untitled Campaign";
  saveData(data);
});

$("#clearTagBtn").onclick = ()=> { tagFilter = null; render(); };

$("#exportBtn").onclick = exportJSON;

$("#importBtn").onclick = ()=> $("#importFile").click();
$("#importFile").addEventListener("change", (e)=>{
  const f = e.target.files?.[0];
  if (f) importJSON(f);
  e.target.value = "";
});

$("#resetBtn").onclick = resetDemo;

// First paint
render();
