/* Di ponsel, tata letak dibuat selebar 430px lalu diperkecil mengikuti layar, supaya tampilan tidak terasa membesar. */
(function () {
  var w = Math.min(screen.width || 0, window.innerWidth || 0) || screen.width;
  if (w && w < 430) {
    var m = document.querySelector('meta[name=viewport]');
    if (m) m.setAttribute('content', 'width=430, viewport-fit=cover');
  }
})();
