const CACHE = 'apprutina-v12';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './anims.js',
  './plan.js',
  './data.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // GIFs de demostración (dataset exercises-dataset — © Gym visual)
  './videos/0025-EIeI8Vf.gif',
  './videos/0027-eZyBC3j.gif',
  './videos/0030-J6Dx1Mu.gif',
  './videos/0032-ila4NZS.gif',
  './videos/0033-GrO65fd.gif',
  './videos/0042-zG0zs85.gif',
  './videos/0043-qXTaZnJ.gif',
  './videos/0044-XlZ4lAC.gif',
  './videos/0047-3TZduzM.gif',
  './videos/0061-iZop9xO.gif',
  './videos/0070-qOgPVf6.gif',
  './videos/0073-i6LWjok.gif',
  './videos/0085-wQ2c4XD.gif',
  './videos/0091-kTbSH9h.gif',
  './videos/0120-UDlhcO8.gif',
  './videos/0150-eYnzaCm.gif',
  './videos/0158-7saC5zz.gif',
  './videos/0165-HPlPoQA.gif',
  './videos/0171-tBWXbIT.gif',
  './videos/0175-WW95auq.gif',
  './videos/0178-goJ6ezq.gif',
  './videos/0179-FVmZVhk.gif',
  './videos/0199-PskORrA.gif',
  './videos/0200-dU605di.gif',
  './videos/0225-P5p0j8B.gif',
  './videos/0241-gAwDzB3.gif',
  './videos/0251-9WTm7dq.gif',
  './videos/0276-iny3m5y.gif',
  './videos/0289-SpYC0Kp.gif',
  './videos/0292-C0MA9bC.gif',
  './videos/0293-BJ0Hz5L.gif',
  './videos/0294-NbVPDMW.gif',
  './videos/0297-gvsWLQw.gif',
  './videos/0301-DwhEmmE.gif',
  './videos/0313-slDvUAU.gif',
  './videos/0314-ns0SIbU.gif',
  './videos/0318-ae9UoXQ.gif',
  './videos/0334-DsgkuIt.gif',
  './videos/0336-RRWFUcw.gif',
  './videos/0351-mpKZGWz.gif',
  './videos/0381-SSsBDwB.gif',
  './videos/0383-EAs3xL9.gif',
  './videos/0396-hxyTtWj.gif',
  './videos/0405-znQUdHY.gif',
  './videos/0410-qx4fgX7.gif',
  './videos/0430-PdmaD0N.gif',
  './videos/0431-aXtJhlg.gif',
  './videos/0447-6TG6x2w.gif',
  './videos/0464-CosupLu.gif',
  './videos/0488-zkgRrbK.gif',
  './videos/0573-rUXfn3R.gif',
  './videos/0582-nnmCTLN.gif',
  './videos/0585-my33uHU.gif',
  './videos/0586-17lJ1kr.gif',
  './videos/0594-bOOdeyc.gif',
  './videos/0597-CHpahtl.gif',
  './videos/0605-ykUOVze.gif',
  './videos/0652-lBDjFxJ.gif',
  './videos/0662-I4hDWkc.gif',
  './videos/0710-7WaDzyL.gif',
  './videos/0739-10Z2DXU.gif',
  './videos/0770-jFtipLl.gif',
  './videos/0811-jQGwmxN.gif',
  './videos/0818-rkg41Fb.gif',
  './videos/0832-s8nrDXF.gif',
  './videos/0857-NAgVB3t.gif',
  './videos/0860-HEJ6DIX.gif',
  './videos/0861-fUBheHs.gif',
  './videos/0868-G08RZcQ.gif',
  './videos/0979-9pa4H5m.gif',
  './videos/1015-G7PXMlT.gif',
  './videos/1331-9pQSkH8.gif',
  './videos/1349-BgljGjd.gif',
  './videos/1350-7I6LNUG.gif',
  './videos/1368-uL9CsKm.gif',
  './videos/1391-ykHcWme.gif',
  './videos/1409-qKBpF7I.gif',
  './videos/1452-Wgaz7pm.gif',
  './videos/1456-wdRZISl.gif',
  './videos/1459-rR0LJzx.gif',
  './videos/1627-hacCyUv.gif',
  './videos/1723-qRZ5S1N.gif',
  './videos/2133-qPEzJjA.gif',
  './videos/2137-Xy4jlWA.gif',
  './videos/2330-LEprlgG.gif',
  './videos/3544-5VXmnV5.gif',
  './videos/3561-GibBPPg.gif',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// cache-first: the app is fully static, everything works offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
