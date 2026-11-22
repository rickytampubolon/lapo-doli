/* Di ponsel, tata letak dibuat selebar 410px lalu diperkecil mengikuti layar, supaya tampilan tidak terasa membesar. */
(function () {
  var w = Math.min(screen.width || 0, window.innerWidth || 0) || screen.width;
  if (w && w < 410) {
    var m = document.querySelector('meta[name=viewport]');
    if (m) m.setAttribute('content', 'width=410, viewport-fit=cover');
  }
})();
