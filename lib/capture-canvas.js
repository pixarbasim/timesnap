/**
 * BSD 3-Clause License
 *
 * Copyright (c) 2018-2019, Steve Tung
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * * Neither the name of the copyright holder nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

const makeCanvasCapturer = require('./make-canvas-capturer');

const canvasToBuffer = function (page, canvasSelector, type) {
  return page.evaluate(async function (canvasSelector, type) {
    var canvasElements = document.querySelectorAll(canvasSelector);
    const { clientWidth, clientHeight } = document.body

    const dpr = window.devicePixelRatio

    const destinationCanvas = document.createElement('canvas');
    destinationCanvas.width = clientWidth * dpr
    destinationCanvas.height = clientHeight * dpr

    var dCtx = destinationCanvas.getContext('2d');
    dCtx.scale(dpr, dpr);

    for(let cIndex=0; cIndex< canvasElements.length; cIndex++) {
      const inputCanvas = canvasElements[cIndex]
      const { width, height, offsetLeft, offsetTop } = inputCanvas

      const { visibility, transform, transformOrigin } = window.getComputedStyle(inputCanvas)

      if (visibility !== 'hidden' && width > 0 && height > 0) {

        const { a, d } = new WebKitCSSMatrix(transform)
        const [ originX, originY ] = transformOrigin.split(' ').map(parseFloat)

        if (visibility !== 'hidden' && width > 0 && height > 0) {
          dCtx.save()

          dCtx.translate(offsetLeft + originX, offsetTop + originY)
          dCtx.scale(a,d)
          dCtx.translate(-(offsetLeft + originX), -(offsetTop + originY))

          dCtx.drawImage(inputCanvas, offsetLeft, offsetTop);

          dCtx.restore()
        }
      }
    }

    return destinationCanvas.toDataURL(type);
  }, canvasSelector, type).then(function (dataUrl) {
    var data = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return new Buffer(data, 'base64');
  });
};

module.exports = makeCanvasCapturer(canvasToBuffer);
