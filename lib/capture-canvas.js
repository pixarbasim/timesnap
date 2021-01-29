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
    /**
     * Paints svg on the canvas after applying transformations of container and wrapper divs.
     *
     * @param {*} ctx : canvas context
     * @param {*} inputElem: svg element (along with wrapper or container)
     * @return {*}
     */
    const drawSvg = async function (ctx, inputElem) {
      return new Promise((resolve, reject) => {

        const wrapperElement = inputElem.querySelector('div')

        const { offsetLeft, offsetTop } = wrapperElement

        const { transform, transformOrigin, opacity = 1 } = window.getComputedStyle(wrapperElement)
        const { a, b, c, d, e, f } = new WebKitCSSMatrix(transform)
        const [originX, originY] = transformOrigin.split(' ').map(parseFloat)

        //apply translations and transforms of wrapper div

        dCtx.translate(offsetLeft + originX, offsetTop + originY)

        dCtx.transform(a, b, c, d, e, f)

        dCtx.translate(-(offsetLeft + originX), -(offsetTop + originY))

        const svgElement = inputElem.querySelector('svg')

        var DOMURL = window.URL || window.webkitURL || window;

        var svg = new Blob([svgElement.outerHTML], { type: 'image/svg+xml' });
        var url = DOMURL.createObjectURL(svg);

        var img = new Image();
        img.crossOrigin = 'Anonymous';

        img.onload = function () {
          ctx.globalAlpha = opacity;
          ctx.drawImage(img, offsetLeft, offsetTop);
          DOMURL.revokeObjectURL(url);
          resolve();
        }
        img.src = url;
      });
    }

    //checks whether an element is of type 'canvas'
    const isCanvasElement = (el) => el.tagName == 'CANVAS'

    var canvasAndSvgElements = document.querySelectorAll(`${canvasSelector}, .bm-container, .svg-container`);

    const { clientWidth, clientHeight } = document.body

    const dpr = window.devicePixelRatio

    const destinationCanvas = document.createElement('canvas');
    destinationCanvas.width = clientWidth * dpr
    destinationCanvas.height = clientHeight * dpr

    var dCtx = destinationCanvas.getContext('2d');
    dCtx.scale(dpr, dpr);

    for(let cIndex=0; cIndex< canvasAndSvgElements.length; cIndex++) {
      const inputElement = canvasAndSvgElements[cIndex]
      const isCanvasLayer = isCanvasElement(inputElement)

      const { offsetLeft, offsetTop } = inputElement
      const { visibility, transform, transformOrigin } = window.getComputedStyle(inputElement)

      if (visibility !== 'hidden') {
        let { width = 0, height = 0 } = isCanvasLayer ? inputElement : window.getComputedStyle(inputElement)
        width = parseInt(width, 10)
        height = parseInt(height, 10)

        if(width > 0 && height > 0){
          dCtx.save()

          const { a, b, c, d, e, f } = new WebKitCSSMatrix(transform)
          const [ originX, originY ] = transformOrigin.split(' ').map(parseFloat)

          dCtx.translate(offsetLeft + originX, offsetTop + originY)
          dCtx.transform(a, b, c, d, e, f)

          if(isCanvasLayer){
            dCtx.translate(-(offsetLeft + originX), -(offsetTop + originY))
            dCtx.drawImage(inputElement, offsetLeft, offsetTop);
          } else {
            await drawSvg(dCtx, inputElement)
          }

          dCtx.restore()
        }
      }
    }
    return destinationCanvas.toDataURL(type);
  }, canvasSelector, type).then(function (dataUrl) {
    var data = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return new Buffer.from(data, 'base64');
  });
};

module.exports = makeCanvasCapturer(canvasToBuffer);
