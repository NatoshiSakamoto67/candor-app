/* 3D-Fahrzeug: Modell aus modelle/<bauart>.glb (Blender-Baukasten tools/fahrzeug3d), three.js erst bei Bedarf geladen.
   Ansichten: Außen, Technik (Karosserie gläsern), Unten, Oben. Bauteile heißen »bt:<id>« und tragen gruppe und name;
   Fehler einer Gruppe färben die passenden Bauteile. Gezeichnet wird nur, wenn sich etwas ändert (Akku auf dem Handy). */

export const webglMoeglich = () => {
  try { const c = document.createElement("canvas"); return Boolean(c.getContext("webgl2") || c.getContext("webgl")); } catch (_) { return false; }
};

/* Welche Bauteile stehen für eine Steuergeräte-Gruppe der Topologie */
export const GRUPPE_BAUTEILE = {
  antrieb: ["motorsteuergeraet", "motor"], fahrwerk: ["abs", "bremse_vl", "bremse_vr", "bremse_hl", "bremse_hr"], rueckhalte: ["airbag_steuergeraet", "lenkrad"],
  assistenz: ["frontradar", "frontkamera", "parksensoren"], anzeige: ["kombiinstrument", "infotainment"], karosserie: ["bordnetz", "batterie"], netzwerk: ["gateway", "obd_buchse"],
};
const TON = { crit: 0xef4444, silent: 0xf59e0b, warn: 0xf59e0b, ok: 0x22c55e, pending: 0x94a3b8 };

let THREE = null, addons = null, ladung = null;
/* Die Imports einmal laden und das Versprechen merken; bei Fehler zurücksetzen, damit ein neuer Versuch möglich bleibt. */
function laden() {
  return (ladung ||= (async () => {
    /* Feste relative Pfade statt Importmap: die Sicherheitsrichtlinie des Servers erlaubt kein eingebettetes Skript. */
    const three = await import("../vendor/three/three.module.js");
    const [gltf, orbit, room, meshopt, hdr] = await Promise.all([import("../vendor/three/jsm/loaders/GLTFLoader.js"), import("../vendor/three/jsm/controls/OrbitControls.js"),
      import("../vendor/three/jsm/environments/RoomEnvironment.js"), import("../vendor/three/jsm/libs/meshopt_decoder.module.js"), import("../vendor/three/jsm/loaders/HDRLoader.js")]);
    THREE = three;
    addons = { GLTFLoader: gltf.GLTFLoader, OrbitControls: orbit.OrbitControls, RoomEnvironment: room.RoomEnvironment, MeshoptDecoder: meshopt.MeshoptDecoder, HDRLoader: hdr.HDRLoader };
  })().catch((e) => { ladung = null; throw e; }));
}

/* Weicher Bodenschatten als Bild statt Echtzeitschatten: kostet auf dem Handy nichts. */
function bodenSchatten(laenge, breite) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  r.addColorStop(0, "rgba(0,0,0,.55)"); r.addColorStop(.6, "rgba(0,0,0,.22)"); r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(laenge * 1.25, breite * 1.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = .002; m.renderOrder = -1;
  return m;
}

/* Feine Metallic-Flakes: kleine zufällige Normalen, sehr fein gekachelt. Einmal erzeugt, von allen Lacken geteilt. */
let flakes = null;
function flakeTextur() {
  if (flakes) return flakes;
  const n = 128, c = document.createElement("canvas"); c.width = c.height = n;
  const g = c.getContext("2d"), img = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.sqrt(Math.max(0, 1 - (x * x + y * y) * .35));
    img.data.set([(x * .35 + 1) * 127.5, (y * .35 + 1) * 127.5, z * 255, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  flakes = new THREE.CanvasTexture(c);
  flakes.wrapS = flakes.wrapT = THREE.RepeatWrapping; flakes.repeat.set(60, 60);
  return flakes;
}
/* Materialien nach Rolle aufwerten: Lack mit Klarlack und Flakes, Glas spiegelnd und getönt, Chrom und Lampen klar. */
function veredeln(m) {
  const name = m.name || "";
  if (name === "lack") {
    const p = new THREE.MeshPhysicalMaterial({ name, color: m.color, metalness: .55, roughness: .38, clearcoat: 1, clearcoatRoughness: .025,
      normalMap: flakeTextur(), normalScale: new THREE.Vector2(.18, .18), envMapIntensity: 1.15 });
    m.dispose(); return p;
  }
  if (name === "glas") {
    const p = new THREE.MeshPhysicalMaterial({ name, color: 0x0a0f14, metalness: 0, roughness: .02, clearcoat: 1, clearcoatRoughness: 0, transparent: true, opacity: .62, envMapIntensity: 1.6 });
    m.dispose(); return p;
  }
  if (name === "chrom" || name === "linse") Object.assign(m, { envMapIntensity: 1.6 });
  if (name === "felge") Object.assign(m, { envMapIntensity: 1.3 });
  return m;
}

export async function erstelle3d(box, { bauart = "limousine", onPick } = {}) {
  await laden();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  /* Neutrales Tonemapping (Khronos PBR Neutral): Lackfarben bleiben farbecht wie im Konfigurator */
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new addons.RoomEnvironment();
  scene.environment = pmrem.fromScene(room, .04).texture;
  /* Studio-HDRI (Poly Haven, CC0) für echte Reflexe im Lack; lädt parallel zum Modell, bis dahin trägt das Raumlicht */
  const hdrLaden = new addons.HDRLoader().loadAsync("umgebung/studio_small_09_1k.hdr");
  const sonne = new THREE.DirectionalLight(0xffffff, 1.6); sonne.position.set(4, 8, 3); scene.add(sonne);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1d22, .6));
  const kamera = new THREE.PerspectiveCamera(32, 1, .05, 100);
  const steuerung = new addons.OrbitControls(kamera, renderer.domElement);
  Object.assign(steuerung, { enableDamping: true, dampingFactor: .08, enablePan: false, minDistance: 3, maxDistance: 14, maxPolarAngle: Math.PI * .94 });

  const loader = new addons.GLTFLoader();
  loader.setMeshoptDecoder(addons.MeshoptDecoder);
  let gltf;
  try {
    gltf = await loader.loadAsync(`modelle/${bauart}.glb`);
  } catch (err) {
    steuerung?.dispose?.(); pmrem.dispose(); room.dispose(); renderer.dispose(); renderer.forceContextLoss();
    throw err;
  }
  const auto = gltf.scene;
  scene.add(auto);
  box.replaceChildren(renderer.domElement);
  const huellbox = new THREE.Box3().setFromObject(auto);
  const groesse = huellbox.getSize(new THREE.Vector3()), mitte = huellbox.getCenter(new THREE.Vector3());
  const schatten = bodenSchatten(groesse.x, groesse.z); schatten.position.x = mitte.x; schatten.position.z = mitte.z; scene.add(schatten);
  /* Kamera wächst mit dem Fahrzeug: Motorrad nah, LKW weit */
  const k = Math.max(groesse.x, groesse.y * 2.1) / 4.77;  // hohe, kurze Fahrzeuge (Motorrad mit Spiegeln) ganz im Bild
  steuerung.minDistance = 1.2 * k; steuerung.maxDistance = 14 * k;

  /* Materialien je Rolle merken, damit Technik-Ansicht und Hervorhebung sie umschalten können */
  const bauteile = new Map(), huelle = [];
  auto.traverse((o) => {
    if (!o.isMesh) return;
    const owner = (() => { let p = o; while (p && p !== auto && !p.userData.id) p = p.parent; return p && p.userData.id ? p : null; })();
    o.material = veredeln(o.material.clone());
    if (owner) {
      const id = owner.userData.id;
      if (!bauteile.has(id)) bauteile.set(id, { id, name: owner.userData.name || id, gruppe: owner.userData.gruppe || "", meshes: [], knoten: owner });
      bauteile.get(id).meshes.push(o);
      o.userData.bt = id;
    } else huelle.push(o);  // alles ohne Bauteil-Namen ist Hülle (Karosserie, Kabine, Aufbau, Verkleidung)
  });
  for (const o of huelle) o.userData.orig = { opacity: o.material.opacity, transparent: o.material.transparent, depthWrite: o.material.depthWrite };
  const alleMeshes = [];
  auto.traverse((o) => { if (o.isMesh) { o.userData.mat0 = o.material; alleMeshes.push(o); } });
  /* Fehlerfokus: alles Übrige wird gläsern mit feinem Umriss, das Umfeld (etwa der Motor) halb sichtbar, das Bauteil glüht rot. */
  const geist = new THREE.MeshBasicMaterial({ color: 0xa9bccf, transparent: true, opacity: .035, depthWrite: false });
  const umfeld = new THREE.MeshStandardMaterial({ color: 0x8d99a6, metalness: .35, roughness: .5, transparent: true, opacity: .5, depthWrite: false });
  const linienMat = new THREE.LineBasicMaterial({ color: 0x9fb6cc, transparent: true, opacity: .38, depthWrite: false });
  let kantenGebaut = false;
  const kantenBauen = () => {
    if (kantenGebaut) return;
    kantenGebaut = true;
    for (const o of alleMeshes) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 30), linienMat); l.visible = false; l.raycast = () => {}; o.add(l); o.userData.kante = l; }
  };

  let w = 0, h = 0, laeuft = 0, puls = new Map(), modus = "aussen", sichtbar = true, weg = false;
  /* Dämpfung: update() meldet Bewegung, dann noch ein Bild; Pulsen hält die Schleife nur bei Fehlern am Laufen. */
  const zeichnen = () => {
    laeuft = 0;
    if (weg || !sichtbar || !w) return;  // unsichtbar oder entsorgt: nicht zeichnen, nicht neu planen
    if (puls.size) pulsen();
    if (flug) fliegen();
    const bewegt = steuerung.update();
    renderer.render(scene, kamera);
    box.dispatchEvent(new Event("bild"));
    if (bewegt || puls.size || flug) anstossen();
  };
  const anstossen = () => { if (!laeuft && !weg) laeuft = requestAnimationFrame(zeichnen); };
  /* Nur zeichnen, wenn die Bühne wirklich sichtbar ist (spart Akku beim Wechsel der Seite oder Bauart). */
  const sicht = new IntersectionObserver((e) => { sichtbar = e[0].isIntersecting && e[0].intersectionRatio > 0; if (sichtbar) anstossen(); });
  sicht.observe(box);
  hdrLaden.then((tex) => {
    if (weg) { tex.dispose(); return; }
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const alt = scene.environment;
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    scene.environmentRotation = new THREE.Euler(0, Math.PI * .65, 0);
    tex.dispose(); alt?.dispose?.();
    anstossen();
  }).catch(() => {});
  steuerung.addEventListener("change", anstossen);
  const groesseAnpassen = () => {
    const r = box.getBoundingClientRect();
    if (Math.abs(r.width - w) < 1 && Math.abs(r.height - h) < 1) return;
    w = r.width; h = r.height;
    renderer.setSize(w, h, false); kamera.aspect = w / Math.max(1, h); kamera.updateProjectionMatrix();
    if (!weg && sichtbar) renderer.render(scene, kamera);
  };
  const ro = new ResizeObserver(groesseAnpassen); ro.observe(box);

  const ANSICHT = {
    aussen: [[5.2, 2.0, 4.4], [0, .55, 0]], technik: [[4.6, 2.6, 4.0], [0, .5, 0]], unten: [[.5, -2.4, 4.2], [0, .3, 0]], oben: [[0, 7.5, .01], [0, 0, 0]],
  };
  function ansicht(name) {
    if (modus === "fehler") {
      for (const o of alleMeshes) { o.material = o.userData.mat0; if (o.userData.kante) o.userData.kante.visible = false; }
      fokusIds = null;
      zustand(letzteToene);
    }
    modus = name;
    zustand(letzteToene);
    const technik = name === "technik" || name === "unten";
    for (const o of huelle) {
      const m = o.material;
      if (technik) Object.assign(m, { transparent: true, opacity: m.name === "glas" ? .08 : .14, depthWrite: false });
      else Object.assign(m, o.userData.orig);
      m.needsUpdate = true;
    }
    const [pos, ziel] = ANSICHT[name];
    flug = null;
    const eng = Math.max(1, Math.min(2.4, 1.5 / kamera.aspect));  // Hochformat am Handy: weiter weg, damit alles ins Bild passt
    kamera.position.set(mitte.x + pos[0] * k * eng, pos[1] * k * eng + (name === "unten" ? 0 : groesse.y * .1), mitte.z + pos[2] * k * eng);
    steuerung.target.set(mitte.x + ziel[0] * k, Math.min(Math.max(ziel[1] * k, groesse.y * .4), groesse.y * .55), mitte.z);
    steuerung.maxPolarAngle = name === "unten" ? Math.PI : Math.PI * .49;
    anstossen();
  }

  /* Zustand: je Bauteil ein Ton; Fehler pulsieren leicht (bei reduzierter Bewegung nur Farbe) */
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let letzteToene = {}, fokusIds = null;
  function zustand(toene) {
    letzteToene = toene || {};
    if (modus === "fehler") return;
    puls = new Map();
    const aussen = modus === "aussen";  // außen keine Zustandsfarben: sonst schimmern Steuergeräte durch die Scheibe
    for (const [id, b] of bauteile) {
      const ton = aussen ? null : toene[id];
      for (const m of b.meshes) {
        m.material.emissive = new THREE.Color(ton ? TON[ton] : 0x000000);
        m.material.emissiveIntensity = ton ? .55 : 0;
      }
      if (ton === "crit" && !still) puls.set(id, b);
    }
    anstossen();
  }
  const pulsen = () => { const t = .35 + .35 * (1 + Math.sin(performance.now() / 250)) / 2; for (const b of puls.values()) for (const m of b.meshes) m.material.emissiveIntensity = t; };

  /* Antippen: Strahl in die Szene, erstes Bauteil gewinnt; Ziehen gilt nicht als Tippen */
  const strahl = new THREE.Raycaster(), maus = new THREE.Vector2();
  let start = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { start = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    maus.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    strahl.setFromCamera(maus, kamera);
    const offen = modus === "technik" || modus === "unten" || modus === "fehler";
    const ziele = [...[...bauteile.values()].flatMap((b) => b.meshes), ...(offen ? [] : huelle)];
    const treffer = strahl.intersectObjects(ziele, false)[0];
    const bt = treffer && treffer.object.userData.bt ? bauteile.get(treffer.object.userData.bt) : null;
    if (onPick) onPick(bt, { x: e.clientX - r.left, y: e.clientY - r.top });
  });

  /* Fehlerfokus: ids glühen rot, kontext bleibt halb sichtbar, der Rest wird gläsern mit Umrisslinien. Kamera fährt
     so heran, dass alle betroffenen Teile im Bild sind, von der Seite, auf der sie sitzen. */
  function fokusFehler(ids, kontext = []) {
    kantenBauen();
    const ziel = new Set(ids.filter((id) => bauteile.has(id))), ctx = new Set(kontext.filter((id) => bauteile.has(id) && !ziel.has(id)));
    if (!ziel.size) return false;
    modus = "fehler"; fokusIds = [...ziel];
    puls = new Map();
    for (const o of alleMeshes) {
      const bt = o.userData.bt, k = o.userData.kante;
      if (bt && ziel.has(bt)) {
        const m = o.userData.mat0; o.material = m;
        Object.assign(m, { transparent: false, opacity: 1, depthWrite: true }); m.emissive = new THREE.Color(0xff2a2a); m.emissiveIntensity = .9; m.needsUpdate = true;
        if (k) k.visible = false;
      } else if (bt && ctx.has(bt)) { o.material = umfeld; if (k) k.visible = true; }
      else { o.material = geist; if (k) k.visible = true; }
    }
    if (!still) for (const id of ziel) puls.set(id, bauteile.get(id));
    const box3 = new THREE.Box3();
    for (const id of ziel) box3.expandByObject(bauteile.get(id).knoten);
    const z = box3.getCenter(new THREE.Vector3()), r = Math.max(.35 * k, box3.getSize(new THREE.Vector3()).length());
    const seite = z.z < mitte.z - .05 ? -1 : 1;
    const richtung = new THREE.Vector3(.9, .75, .95 * seite).normalize();
    /* Schmales (hohes) Bild wie auf dem Handy: weiter weg, damit das Umfeld erkennbar bleibt */
    const abstand = Math.max(steuerung.minDistance * 1.6, r * 2.8) * Math.max(1, 1.45 / Math.max(.4, kamera.aspect));
    const nach = z.clone().add(richtung.multiplyScalar(Math.min(steuerung.maxDistance, abstand)));
    steuerung.maxPolarAngle = Math.PI * .49;
    flug = { start: performance.now(), von: kamera.position.clone(), nach, zielVon: steuerung.target.clone(), zielNach: z };
    if (still) { kamera.position.copy(nach); steuerung.target.copy(z); flug = null; }
    anstossen();
    return true;
  }

  /* Kamerafahrt zu einem Bauteil: Technik-Ansicht, Bauteil in der Mitte, nah heran. Bewegung reduziert: sofort. */
  let flug = null;
  const fliegen = () => {
    const t = Math.min(1, (performance.now() - flug.start) / 650), e = 1 - (1 - t) ** 3;
    kamera.position.lerpVectors(flug.von, flug.nach, e); steuerung.target.lerpVectors(flug.zielVon, flug.zielNach, e);
    if (t >= 1) flug = null;
  };
  function fokus(id) {
    const b = bauteile.get(id); if (!b) return false;
    if (modus !== "technik") ansicht("technik");
    const c = new THREE.Box3().setFromObject(b.knoten), z = c.getCenter(new THREE.Vector3()), r = Math.max(.25, c.getSize(new THREE.Vector3()).length());
    const richtung = kamera.position.clone().sub(steuerung.target).normalize();
    const nach = z.clone().add(richtung.multiplyScalar(Math.max(steuerung.minDistance, r * 3.2, 1.6 * k)));
    flug = { start: performance.now(), von: kamera.position.clone(), nach, zielVon: steuerung.target.clone(), zielNach: z };
    if (still) { kamera.position.copy(nach); steuerung.target.copy(z); flug = null; }
    anstossen();
    return true;
  }

  /* Bildschirmlage eines Bauteils (für Etiketten) */
  const v = new THREE.Vector3(), zentren = new Map();
  function lage(id) {
    const b = bauteile.get(id); if (!b || !w) return null;
    if (!zentren.has(id)) zentren.set(id, new THREE.Box3().setFromObject(b.knoten).getCenter(new THREE.Vector3()));
    kamera.updateMatrixWorld();
    v.copy(zentren.get(id)).project(kamera);
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, sichtbar: v.z < 1 };
  }

  groesseAnpassen();
  ansicht("aussen");
  return {
    bauteile, ansicht, zustand, lage, fokus, fokusFehler, get fokusIds() { return fokusIds; }, get modus() { return modus; },
    zeichne: anstossen,
    lackfarbe(hex) { for (const o of huelle) if (o.material.name === "lack") { o.material.color.set(hex); } anstossen(); },
    entsorgen() {
      weg = true; ro.disconnect(); sicht.disconnect(); cancelAnimationFrame(laeuft); steuerung.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); for (const m of [].concat(o.material || [])) { for (const v of Object.values(m)) if (v && v.isTexture) v.dispose(); m.dispose?.(); } });
      scene.environment?.dispose?.(); room.dispose?.(); pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss(); box.replaceChildren();
    },
  };
}
