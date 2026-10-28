/* 3D-Fahrzeug: Modell aus modelle/<bauart>.glb (Blender-Baukasten tools/fahrzeug3d), three.js erst bei Bedarf geladen.
   Ansichten: Außen, Technik (Karosserie gläsern), Unten, Oben. Bauteile heißen »bt:<id>« und tragen gruppe und name;
   Fehler einer Gruppe färben die passenden Bauteile. Gezeichnet wird nur, wenn sich etwas ändert (Akku auf dem Handy). */

export const webglMoeglich = () => {
  try { const c = document.createElement("canvas"); return Boolean(c.getContext("webgl2") || c.getContext("webgl")); } catch (_) { return false; }
};

/* Welche Bauteile stehen für eine Steuergeräte-Gruppe der Topologie */
export const GRUPPE_BAUTEILE = {
  antrieb: ["motorsteuergeraet", "motor"], fahrwerk: ["abs", "bremse_vl", "bremse_vr", "bremse_hl", "bremse_hr"], rueckhalte: ["airbag_steuergeraet", "lenkrad"],
  assistenz: ["frontradar", "frontkamera", "parksensoren"], anzeige: ["kombiinstrument", "infotainment"], karosserie: ["bordnetz"], netzwerk: ["gateway", "obd_buchse"],
};
const TON = { crit: 0xef4444, silent: 0xf59e0b, warn: 0xf59e0b, ok: 0x22c55e, pending: 0x94a3b8 };

let THREE = null, addons = null;
async function laden() {
  if (THREE) return;
  THREE = await import("three");
  const [gltf, orbit, room, meshopt] = await Promise.all([import("three/addons/loaders/GLTFLoader.js"), import("three/addons/controls/OrbitControls.js"),
    import("three/addons/environments/RoomEnvironment.js"), import("three/addons/libs/meshopt_decoder.module.js")]);
  addons = { GLTFLoader: gltf.GLTFLoader, OrbitControls: orbit.OrbitControls, RoomEnvironment: room.RoomEnvironment, MeshoptDecoder: meshopt.MeshoptDecoder };
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

export async function erstelle3d(box, { bauart = "limousine", onPick } = {}) {
  await laden();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  box.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new addons.RoomEnvironment(), .04).texture;
  const sonne = new THREE.DirectionalLight(0xffffff, 1.6); sonne.position.set(4, 8, 3); scene.add(sonne);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1d22, .6));
  const kamera = new THREE.PerspectiveCamera(32, 1, .05, 100);
  const steuerung = new addons.OrbitControls(kamera, renderer.domElement);
  Object.assign(steuerung, { enableDamping: true, dampingFactor: .08, enablePan: false, minDistance: 3, maxDistance: 14, maxPolarAngle: Math.PI * .94 });

  const loader = new addons.GLTFLoader();
  loader.setMeshoptDecoder(addons.MeshoptDecoder);
  const gltf = await loader.loadAsync(`modelle/${bauart}.glb`);
  const auto = gltf.scene;
  scene.add(auto);
  const huellbox = new THREE.Box3().setFromObject(auto);
  const groesse = huellbox.getSize(new THREE.Vector3()), mitte = huellbox.getCenter(new THREE.Vector3());
  const schatten = bodenSchatten(groesse.x, groesse.z); schatten.position.x = mitte.x; schatten.position.z = mitte.z; scene.add(schatten);
  /* Kamera wächst mit dem Fahrzeug: Motorrad nah, LKW weit */
  const k = Math.max(groesse.x, groesse.y * 1.6) / 4.77;
  steuerung.minDistance = 1.2 * k; steuerung.maxDistance = 14 * k;

  /* Materialien je Rolle merken, damit Technik-Ansicht und Hervorhebung sie umschalten können */
  const bauteile = new Map(), huelle = [];
  auto.traverse((o) => {
    if (!o.isMesh) return;
    const owner = (() => { let p = o; while (p && p !== auto && !p.userData.id) p = p.parent; return p && p.userData.id ? p : null; })();
    o.material = o.material.clone();
    if (o.material.name === "glas") Object.assign(o.material, { transparent: true, opacity: .82 });
    if (owner) {
      const id = owner.userData.id;
      if (!bauteile.has(id)) bauteile.set(id, { id, name: owner.userData.name || id, gruppe: owner.userData.gruppe || "", meshes: [], knoten: owner });
      bauteile.get(id).meshes.push(o);
      o.userData.bt = id;
    } else huelle.push(o);  // alles ohne Bauteil-Namen ist Hülle (Karosserie, Kabine, Aufbau, Verkleidung)
  });
  for (const o of huelle) o.userData.orig = { opacity: o.material.opacity, transparent: o.material.transparent, depthWrite: o.material.depthWrite };

  let w = 0, h = 0, laeuft = 0, puls = new Map(), modus = "aussen";
  /* Dämpfung: update() meldet Bewegung, dann noch ein Bild; Pulsen hält die Schleife nur bei Fehlern am Laufen. */
  const zeichnen = () => {
    laeuft = 0;
    if (puls.size) pulsen();
    if (flug) fliegen();
    const bewegt = steuerung.update();
    renderer.render(scene, kamera);
    box.dispatchEvent(new Event("bild"));
    if (bewegt || puls.size || flug) anstossen();
  };
  const anstossen = () => { if (!laeuft) laeuft = requestAnimationFrame(zeichnen); };
  steuerung.addEventListener("change", anstossen);
  const groesseAnpassen = () => {
    const r = box.getBoundingClientRect();
    if (Math.abs(r.width - w) < 1 && Math.abs(r.height - h) < 1) return;
    w = r.width; h = r.height;
    renderer.setSize(w, h, false); kamera.aspect = w / Math.max(1, h); kamera.updateProjectionMatrix(); anstossen();
  };
  const ro = new ResizeObserver(groesseAnpassen); ro.observe(box);

  const ANSICHT = {
    aussen: [[5.2, 2.0, 4.4], [0, .55, 0]], technik: [[4.6, 2.6, 4.0], [0, .5, 0]], unten: [[.5, -2.4, 4.2], [0, .3, 0]], oben: [[0, 7.5, .01], [0, 0, 0]],
  };
  function ansicht(name) {
    modus = name;
    const technik = name === "technik" || name === "unten";
    for (const o of huelle) {
      const m = o.material;
      if (technik) Object.assign(m, { transparent: true, opacity: m.name === "glas" ? .08 : .14, depthWrite: false });
      else Object.assign(m, o.userData.orig);
      m.needsUpdate = true;
    }
    const [pos, ziel] = ANSICHT[name];
    flug = null;
    kamera.position.set(mitte.x + pos[0] * k, pos[1] * k + (name === "unten" ? 0 : groesse.y * .1), mitte.z + pos[2] * k);
    steuerung.target.set(mitte.x + ziel[0] * k, Math.min(ziel[1] * k, groesse.y * .55), mitte.z);
    steuerung.maxPolarAngle = name === "unten" ? Math.PI : Math.PI * .49;
    anstossen();
  }

  /* Zustand: je Bauteil ein Ton; Fehler pulsieren leicht (bei reduzierter Bewegung nur Farbe) */
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function zustand(toene) {
    puls = new Map();
    for (const [id, b] of bauteile) {
      const ton = toene[id];
      for (const m of b.meshes) {
        m.material.emissive = new THREE.Color(ton ? TON[ton] : 0x000000);
        m.material.emissiveIntensity = ton ? .55 : 0;
      }
      if (ton === "crit" && !still) puls.set(id, b);
    }
    anstossen();
  }
  const uhr = new THREE.Clock();
  const pulsen = () => { const t = .35 + .35 * (1 + Math.sin(uhr.getElapsedTime() * 4)) / 2; for (const b of puls.values()) for (const m of b.meshes) m.material.emissiveIntensity = t; };

  /* Antippen: Strahl in die Szene, erstes Bauteil gewinnt; Ziehen gilt nicht als Tippen */
  const strahl = new THREE.Raycaster(), maus = new THREE.Vector2();
  let start = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { start = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    maus.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    strahl.setFromCamera(maus, kamera);
    const ziele = [...bauteile.values()].flatMap((b) => b.meshes);
    const treffer = strahl.intersectObjects(ziele, false)[0];
    if (treffer && onPick) onPick(bauteile.get(treffer.object.userData.bt), { x: e.clientX - r.left, y: e.clientY - r.top });
    else if (onPick) onPick(null);
  });

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
  const v = new THREE.Vector3();
  function lage(id) {
    const b = bauteile.get(id); if (!b || !w) return null;
    kamera.updateMatrixWorld();
    new THREE.Box3().setFromObject(b.knoten).getCenter(v).project(kamera);
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, sichtbar: v.z < 1 };
  }

  groesseAnpassen();
  ansicht("aussen");
  return {
    bauteile, ansicht, zustand, lage, fokus, get modus() { return modus; },
    zeichne: anstossen,
    lackfarbe(hex) { for (const o of huelle) if (o.material.name === "lack") { o.material.color.set(hex); } anstossen(); },
    entsorgen() { ro.disconnect(); cancelAnimationFrame(laeuft); steuerung.dispose(); renderer.dispose(); pmrem.dispose(); box.replaceChildren(); },
  };
}
