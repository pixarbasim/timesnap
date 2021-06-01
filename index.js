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

const puppeteer = require('puppeteer');
const path = require('path');
const defaultDuration = 5;
const defaultFPS = 60;
const { overwriteRandom } = require('./lib/overwrite-random');
const { promiseLoop, getBrowserFrames, sleep } = require('./lib/utils');
const initializePageUtils = require('./lib/page-utils');
const initializeMediaTimeHandler = require('./lib/media-time-handler');


module.exports = function (config) {
  config = Object.assign({}, config || {});
  var url = config.url || 'index.html';
  var delayMs = 1000 * (config.start || 0);
  var startWaitMs = 1000 * (config.startDelay || 0);
  var frameNumToTime = config.frameNumToTime;
  var unrandom = config.unrandomize;
  var fps = config.fps, frameDuration;
  var framesToCapture;
  var outputPath = path.resolve(process.cwd(), (config.outputDirectory || './'));

  if (url.indexOf('://') === -1) {
    // assume it is a file path
    url = 'file://' + path.resolve(process.cwd(), url);
  }

  if (config.frames) {
    framesToCapture = config.frames;
    if (!fps) {
      if (config.duration) {
        fps = framesToCapture / config.duration;
      }
      else {
        fps = defaultFPS;
      }
    }
  } else {
    if (!fps) {
      fps = defaultFPS;
    }
    if (config.duration) {
      framesToCapture = config.duration * fps;
    } else {
      framesToCapture = defaultDuration * fps;
    }
  }

  frameDuration = 1000 / fps;

  if (!frameNumToTime) {
    frameNumToTime = function (frameCount) {
      return (frameCount-1) * frameDuration;
    };
  }

  const log = function () {
    if (!config.quiet) {
      if (config.logToStdErr) {
        // eslint-disable-next-line no-console
        console.error.apply(this, arguments);
      } else {
        // eslint-disable-next-line no-console
        console.log.apply(this, arguments);
      }
    }
  };

const gotoPageWithRetries = async function (page, url, retryCount = 10) {
  if (retryCount > 0) {

    const onRetry = async (count) => {
      log('Going to retry');
      await sleep(250); //Sleep for 250ms
      return await gotoPageWithRetries(page, url, count);
    }

    try {
      const result = await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 }).catch(e => e);
      if (result instanceof Error) {
        //Retry in case an error is thrown on the puppeteer navigation
        log('Failed to load page with error: ' + result.message);
        if(retryCount > 1){
          return onRetry(result, retryCount - 1);
        }
      }        
    } catch(err) {
      log('Failed to load page with error: ' + err.message);
      return onRetry(retryCount -1);
    }

    return result;
  }
};


  const launchOptions = {
    dumpio: !config.quiet && !config.logToStdErr,
    headless: (config.headless !== undefined ? config.headless : true),
    executablePath: config.executablePath,
    args: config.launchArguments || []
  };

  return puppeteer.launch(launchOptions).then(function (browser) {
    return browser.newPage().then(function (page) {
      config = Object.assign({
        log,
        outputPath,
        page,
        framesToCapture
      }, config);
      var capturer, timeHandler;
      if (config.canvasCaptureMode) {
        if (typeof config.canvasCaptureMode === 'string' && config.canvasCaptureMode.startsWith('immediate')) {
          // remove starts of 'immediate' or 'immediate:'
          config.canvasCaptureMode = config.canvasCaptureMode.replace(/^immediate:?/, '');
          ({ timeHandler, capturer } = require('./lib/immediate-canvas-handler')(config));
          log('Capture Mode: Immediate Canvas');
        } else {
          timeHandler = require('./lib/overwrite-time');
          capturer = require('./lib/capture-canvas')(config);
          log('Capture Mode: Canvas');
        }
      } else {
        timeHandler = require('./lib/overwrite-time');
        capturer = require('./lib/capture-screenshot')(config);
        log('Capture Mode: Screenshot');
      }
      return Promise.resolve().then(function () {
        if (config.viewport) {
          if (!config.viewport.width) {
            config.viewport.width = page.viewport().width;
          }
          if (!config.viewport.height) {
            config.viewport.height = page.viewport().height;
          }
          return page.setViewport(config.viewport);
        }
      }).then(function () {
        return overwriteRandom(page, unrandom, log);
      }).then(function () {
        return timeHandler.overwriteTime(page);
      }).then(function () {
        return initializePageUtils(page);
      }).then(function () {
        return initializeMediaTimeHandler(page);
      }).then(function () {
        log('Going to ' + url + '...');
        return gotoPageWithRetries(page, url);
      }).then(function () {
        log('Page loaded');
        if ('preparePage' in config) {
          log('Preparing page before screenshots...');
          return Promise.resolve(config.preparePage(page)).then(function () {
            log('Page prepared');
          });
        }
      }).then(function () {
        return new Promise(function (resolve) {
          setTimeout(resolve, startWaitMs);
        });
      }).then(function () {
        if (capturer.beforeCapture) {
          return capturer.beforeCapture(config);
        }
      }).then(function () {
        var browserFrames = getBrowserFrames(page.mainFrame());
        // A marker is an action at a specific time
        var markers = [];
        var captureMarkers = [];
        var markerId = 0;
        for (let i = 1; i <= framesToCapture; i++) {
          captureMarkers.push({
            time: delayMs + frameNumToTime(i, framesToCapture),
            frameCount: i,
            id: markerId,
            type: 'Capture'
          });
          markerId++;
        }

        var addAnimationGapThreshold = 100;
        var addAnimationFrameTime = 20;
        if (captureMarkers.length && captureMarkers[0].time > addAnimationGapThreshold) {
          markers.push({
            time: addAnimationFrameTime,
            type: 'Only Animate',
            id: markerId
          });
          markerId++;
        }

        var lastMarkerTime = 0;
        var maximumAnimationFrameDuration = config.maximumAnimationFrameDuration;
        captureMarkers.forEach(function (e) {
          if (maximumAnimationFrameDuration) {
            let frameDuration = e.time - lastMarkerTime;
            let framesForDuration = Math.ceil(frameDuration / maximumAnimationFrameDuration);
            for (let i = 1; i < framesForDuration; i++) {
              markers.push({
                time: lastMarkerTime + (i * frameDuration / framesForDuration),
                type: 'Only Animate',
                id: markerId
              });
              markerId++;
            }
          }
          markers.push(e);
          lastMarkerTime = e.time;
        });

        markers = markers.sort(function (a, b) {
          if (a.time !== b.time) {
            return a.time - b.time;
          }
          return a.id - b.id;
        });

        var startCaptureTime = new Date().getTime();
        var markerIndex = 0;
        var nextFrameIndex = -1;
        return promiseLoop(function () {
          return markerIndex < markers.length;
        }, function () {
          var e = markers[markerIndex];
          var p;
          markerIndex++;

          while(e.frameCount < nextFrameIndex ){
            e = markers[markerIndex];
            markerIndex++;
            continue;
          }

          if (e.type === 'Capture') {
            p = timeHandler.goToTimeAndAnimateForCapture(browserFrames, e.time);
            // because this section is run often and there is a small performance
            // penalty of using .then(), we'll limit the use of .then()
            // to only if there's something to do
            if (config.preparePageForScreenshot) {
              p = p.then(function () {
                log('Preparing page for screenshot...');
                return config.preparePageForScreenshot(page, e.frameCount, framesToCapture);
              }).then(function (frameIndex) {
                if(frameIndex) {
                  // skip frames till this frame index
                  nextFrameIndex = frameIndex;
                }
                log('Page prepared');
              });
            }
            if (capturer.capture) {
              p = p.then(function () {
                return capturer.capture(config, e.frameCount, framesToCapture);
              });
            }
          } else if (e.type === 'Only Animate') {
            p = timeHandler.goToTimeAndAnimate(browserFrames, e.time);
          }
          return p;
        }).then(function () {
          log('Elapsed capture time: ' + (new Date().getTime() - startCaptureTime));
          if (capturer.afterCapture) {
            return capturer.afterCapture();
          }
        });
      });
    }).then(function () {
      return browser.close();
    }).catch(function (err) {
      log(err);
      throw err;
    });
  });
};
