/**
 * h5 video 播放器，仅支持单个视频播放
 */
;(function($){
  var defaultOpts = {
    'width': 750,
    'height': 750,
    'isPosterFull': false,
    'onFullscreen': null,
    'onExitFullscreen': null,
    'onEnded': null,
    // 先于 onStartPlay 发生，第一次点击播放和点击重播触发
    'onClickPlay': null,
    // 在 onClickPlay 发生之后，确认视频开始播放了触发
    'onStartPlay': null,
    'bgm': 'https://audio-1.dtstatic.com/20170524/185230/girl.mp3',
    'selPoster': 'md-h5-video-poster',
    'selStatus': 'md-h5-video-status',
    'selBtnPlay': 'md-h5-video-play',
    'selBtnLoading': 'md-h5-video-loading',
    'selBtnReplay': 'md-h5-video-replay',
    /* to be done */
    'selBtnFull': 'md-h5-video-full',
    /* to be done */
    'selBtnTime': 'md-h5-video-time',
    /* to be done */
    'selProgress': 'md-h5-video-progress'
  }
  $.extend($.fn, {
    h5Video: function(op){
      $.Event('h5Video:replay', { bubbles: false });
      $.Event('h5Video:play', { bubbles: false });

      // 合并到默认配置
      var opts = $.extend(defaultOpts, op);
      var $t = this;
      var $w = $(window);
      var isFullScreen = false;
      var canPlayStarted = false;
      var isStarted = false;
      var stall;
      var timerPause;
      var timerEnded;





      // 添加 video
      var $video = $t.find('video');
      if (!$video.length) {
        console.log('video not found')
        return;
      }
      var video = $video.get(0);

      // 添加 poster 层
      var $poster = $('<div class="' + opts.selPoster + '"></div>');

      if (opts.isPosterFull) {
        $poster.css({
          'position': 'fixed',
          'background-image': 'url(' + $video.attr('poster') + ')',
          'background-size': $w.width() + 'px ' + $w.height() + 'px',
          'background-repeat': 'no-repeat'
        });
      } else {

        $poster.css({
          'background-image': 'url(' + $video.attr('poster') + ')',
          'background-size': opts.width + 'px ' + opts.height + 'px',
          'background-repeat': 'no-repeat'
        });
      }

      $t.append($poster);
      showPoster();

      // 添加 status 层
      var $btnFull = $('<div class="'+opts.selBtnFull+'">全屏</div>');
      var $btnPlay = $('<div class="'+opts.selBtnPlay+'">播放</div>');
      var $btnReplay = $('<div class="'+opts.selBtnReplay+'">重播</div>');
      var $btnLoading = $('<div class="'+opts.selBtnLoading+'"></div>');
      var $btnTime = $('<div class="'+opts.selBtnTime+'"></div>');
      var $status = $('<div class="'+opts.selStatus+'"></div>')
      .append($btnFull)
      .append($btnPlay)
      .append($btnReplay)
      .append($btnLoading)
      .append($btnTime)

      $t.append($status);



      // 计算video占位宽高
      resizeVideo();

      // video 一开始是隐藏状态
      showVideo();

      console.log('z-index of video',$video.css('z-index'))


      var audio;
      // 如果有 bgm 
      if (opts.bgm) {
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        audio = {
          'buffer': null,
          'context': null,
          'startTime': null,
          'currentTime': 0,
          'source': null,
          'gainNode': null,
          'paused': true,
          'volume': 1,
          'timeUsedForLoading': 0,
          'readyState': 0,

          // bgm 为音频url地址，xhr get 获取 buffer 数据
          'init': function (bgm, callback) {
            console.log('init with bgm: ', bgm)
            var xhr = new XMLHttpRequest();
            xhr.open('GET', bgm, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function(e) {
              var arrayBuffer = this.response;
              audio.readyState = 1;

              var context = new AudioContext();
              context.decodeAudioData(
                arrayBuffer,
                function(buffer) {
                  // 与 html audio 保持一致，readyState = 4 表示可以播放
                  audio.readyState = 4;
                  audio.buffer = buffer;
                  console.log('audio load complete readyState', audio.readyState)
                  callback && callback();
                  context = null;
                },
                function(e) {
                  //解码出错时的回调函数
                  console.log('Error decoding file', e);
                  context = null;
                }
              );
            };
            xhr.send();
          },

          // play 方法与 html audio 保持一致
          // 增设 time 参数，可指定播放起始时间秒数(s)
          'play': function (time) {
            console.log('try audio play')

            // 与 html audio 保持一致，readyState = 4 表示可以播放
            if (audio.readyState == 4 && audio.paused) {
              var timeStart = new Date();
              audio.createSource();
              console.log('audio playing with currentTime: ', audio.currentTime);
              var source = audio.source;
              if (!source.start) {
                source.start = source.noteOn;
              }

              audio.startTime = typeof time === 'number' ? time : audio.currentTime;

              var timeEnd = new Date();
              audio.timeUsedForLoading = (timeEnd.getTime() - timeStart.getTime())/1000;
              source.start(0, audio.startTime);
              audio.paused = false;
            }
          },

          // pause 方法与 html audio 保持一致
          'pause': function () {
            console.log('try audio pause');
            // 与 html audio 保持一致，readyState = 4 表示可以播放
            if (audio.readyState == 4 && !audio.paused) {

              audio.setCurrentTime();
              console.log('audio pause with currentTime: ', audio.currentTime);
              var source = audio.source;
              if (!source.stop) {
                source.stop = source.noteOff;
              }
              source.stop();
              audio.paused = true;
            }
          },

          // 与 html audio 保持一致，volume 取值范围： 0 - 1 
          'changeVolume': function (volume) {
            if (audio.readyState == 4) {
              audio.gainNode.gain.value = volume;
            }
          },

          // 由于 context.currentTime 是从 new AudioContext() 开始算起
          // 通过此方法进行纠正，计算正确的 currentTime 保存至 audio.currentTime 
          'setCurrentTime': function () {
            var ctxTime = audio.context.currentTime;
            audio.currentTime = ctxTime + audio.startTime - audio.timeUsedForLoading;
          },


          // 创建播放 source with audio.buffer
          'createSource': function () {
            var context = new AudioContext();
            var source = context.createBufferSource();
            source.buffer = audio.buffer;
            source.loop = true;
            if (!context.createGain) {
              context.createGain = context.createGainNode;
            }
            audio.gainNode = context.createGain();

            // Connect source to a gain node
            source.connect(audio.gainNode);
            // Connect gain node to destination
            audio.gainNode.connect(context.destination);

            audio.source = source;
            audio.context = context;
          }
        }
      }

      // 预先加载audio 资源
      audio && audio.init(opts.bgm);


      console.log('is autoplay ? ',video.autoplay)
      if (video.autoplay) {
        canPlayStarted = true;
        showFromStatus($btnLoading);
      } else {
        showFromStatus($btnPlay);
      }


      // 反射调用
      function invokeFieldOrMethod (element, method) {
        var usablePrefixMethod;
        ['webkit', 'moz', 'ms', 'o', ''].forEach(function (prefix) {
          if (usablePrefixMethod) return;
          if (prefix === '') {
            // 无前缀，方法首字母小写
            method = method.slice(0,1).toLowerCase() + method.slice(1);
          }
          var typePrefixMethod = typeof element[prefix + method];
          if (typePrefixMethod + '' !==  'undefined') {
            if (typePrefixMethod ===  'function') {
              usablePrefixMethod = element[prefix + method]();
            } else {
              usablePrefixMethod = element[prefix + method];
            }
          }
        });

        return usablePrefixMethod;
      };


      // 进入全屏
      function launchFullscreen (element) {
        if(element.requestFullscreen) {
          element.requestFullscreen();
        } else if(element.mozRequestFullScreen) {
          element.mozRequestFullScreen();
        } else if(element.msRequestFullscreen){
          element.msRequestFullscreen();
        } else if(element.oRequestFullscreen){
          element.oRequestFullscreen();
        }
        else if(element.webkitRequestFullscreen)
        {
          element.webkitRequestFullScreen();
        }else{
          var docHtml = document.documentElement;
          var docBody = document.body;
          var cssText = 'width:100%;height:100%;overflow:hidden;';
          docHtml.style.cssText = cssText;
          docBody.style.cssText = cssText;
          video.style.cssText = cssText + ';margin:0px;padding:0px;';
          isFullScreen = true;
        }
      }

      // 延迟退出全屏
      function delayExitFullscreen (delay) {
        window.setTimeout(function exit(){
          if(invokeFieldOrMethod(document,'FullScreen')
             || invokeFieldOrMethod(document,'IsFullScreen')
             || document.IsFullScreen) {
            exitFullscreen();
          }
        }, delay || 1000);
      }

      // 退出全屏
      function exitFullscreen () {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if(document.oRequestFullscreen){
          document.oCancelFullScreen();
        }else if (document.webkitExitFullscreen){
          document.webkitExitFullscreen();
        }else{
          var docHtml = document.documentElement;
          var docBody = document.body;
          docHtml.style.cssText = '';
          docBody.style.cssText = '';
          video.style.cssText = '';
          isFullScreen = false;
        }
      }


      /**
       * durationFormat
       * 规则： noHour 为false 则最多分三段，小时:分钟:秒 (1:59:23)，否则，最多显示两段，分钟:秒 (126:01)
       * 非最左位置不足10则补0，最左位不补0
       * 示例： 1:01:00 59:59 9:01 0:01
       * @param       {String}   inputString              duration字符串 2:01 2.2323:01 265
       * @param       {Boolean}  noHour                   是否按小时分段
       * @return      {String}                            输出格式 2:01
       */
      function durationFormat (inputString, noHour) {
        if (typeof inputString === 'string' && inputString.indexOf(':') > -1) {
          // 是 2:01 格式 或  2.002:01 格式
          var sps = inputString.split(':');
          for (var i=0; i<sps.length; i++) {
            sps[i] = Math.floor(sps[i]) || 0;
            if (i > 0 && sps[i] < 10) {
              sps[i] = '0' + sps[i]
            }
          }
          return sps.join(':')
        } else {
          var totalSecond = parseInt(inputString) || 0;
          var hourSecond = 3600;
          var minuteSecond = 60;
          if (!noHour && totalSecond >= hourSecond) {
            var hour = Math.floor(totalSecond / hourSecond);
            var lef = totalSecond % hourSecond;
            var minute = Math.floor(lef / minuteSecond);
            if (minute < 10) {
              minute = '0' + minute;
            }
            var second = lef % minuteSecond;
            if (second < 10) {
              second = '0' + second;
            }
            return hour + ':' + minute + ':' + second;
          } else {
            var minute = Math.floor(totalSecond / minuteSecond);
            var second = totalSecond % minuteSecond;
            if (second < 10) {
              second = '0' + second;
            }
            return minute + ':' + second;
          }
        }
      }

      // 获取视频播放的最后秒数
      function getEnd (media) {
        var end = 0;
        try {
          end = media.buffered.end(0) || 0;
          end = parseInt(end * 1000 + 1) / 1000;
        } catch (e) {}
        return end;
      }

      function resizeVideo () {
        // 设置页面高度先
        $('body').css({
          'height': $w.height()
        })

        // fig hegiht
        var vHeight = opts.height/opts.width * $w.width();
        $t.css({
          'width': '100%',
          'height': vHeight
        });
      }

      function showVideo () {
        $t.css({
          'display': 'block'
        })
        $video.css({
          'visibility': 'visible'
        })
      }

      function hideVideo () {
        $video.css({
          'visibility': 'hidden'
        })
      }

      // 显示 status 层里的某个部件
      function showFromStatus ($sel) {
        console.log('showFromStatus sel', $sel.attr('class'));
        $status.children().css({
          'display': 'none'
        })

        $sel.add($status).css({
          'display': 'flex'
        });
      }

      // 隐藏 status 层
      function hideStatus () {
        console.log('hide status')
        $status.css({
          'display': 'none'
        });
      }

      // 显示 poster 层
      function showPoster () {
        $poster.css({
          'display': 'block'
        });
      }

      // 隐藏 poster 层
      function hidePoster () {
        $poster.css({
          'display': 'none'
        });
      }

      // 随时检查mute 状态 
      function checkMuteStatus () {
        if (video.muted) {
          syncAudioVolume(0)
        } else {
          syncAudioVolume(video.volume)
        }
      }

      function syncAudioVolume (volume) {
        audio && audio.changeVolume(volume)
      }

      function onVideoStartPlay () {
        hidePoster();
        hideStatus();
        opts.onStartPlay && opts.onStartPlay();
        isStarted = true;

        video.controls = true;
      }

      // 视频加载完毕
      $video.on('loadeddata', function() {
        console.log('seq video loaded and duration: ', video.duration)
      });
      // // bgm加载完毕
      // $audio.on('loadeddata', function() {
      //   console.log('audio loaded')

      //   // 音量同步
      //   audio.volume = video.volume;
      // });


      // 网络中断
      $video.on('stalled', function() {
        // 中断的时候记录已经缓存的内容
        console.log('stalled')
        if (isStarted) {
          stall = getEnd(video);
          console.log('stall isPaused ? '+video.paused+' stall value ', stall)
          if (stall > video.currentTime && !video.paused) {
            // 继续播放缓存内容
            // video.play();
          }
        }
      });

      // 开始播放
      $video.on('play', function(e) {
        console.log('seq start play');
      });

      $video.on('playing', function(e) {
        console.log('seq playing');
      });

      $video.on('canplay', function(e) {
        console.log('seq canplay with canPlayStarted: ', canPlayStarted);
        if (canPlayStarted) {
          onVideoStartPlay();
        }
      });



      // 视频播放完毕
      $video.on('ended', function(e) {
        console.log('video ended')
        clearTimeout(timerPause);
        clearTimeout(timerEnded);
        timerEnded = setTimeout(function () {
          audio && audio.pause();
          opts.onEnded && opts.onEnded();
        }, 100)
      });
      

      // 暂停播放
      $video.on('pause', function(e) {
        console.log('pausing');
        clearTimeout(timerPause);
        clearTimeout(timerEnded);
        timerPause = setTimeout(function () {
          audio && audio.pause();
        }, 20)
      });

      // 移动位置开始
      $video.on('seeking', function(e) {
        if (video.currentTime + 1 > video.duration) {
          video.currentTime = video.duration - 1;
        }
        console.log('isPaused ? '+video.paused+' seeking currentTime: ', video.currentTime);
      });

      // 移动位置结束
      $video.on('seeked', function(e) {
        if (video.currentTime + 2 > video.duration) {
          video.currentTime = video.duration - 2;
        } else {
          console.log('clear timeout of ended')
          clearTimeout(timerPause);
          clearTimeout(timerEnded);
        }
        console.log('isPaused ? '+video.paused+' seeked currentTime: ', video.currentTime);
      });
      
      // 音量更新
      $video.on('volumechange', function () {
        syncAudioVolume(video.volume);
      });

      // 播放时间更新
      $video.on('timeupdate', function() {
        // readyState=4 表示音频数据充足，可以播放
        console.log('seq audio paused: ' + audio.paused + ' audio.readyState: ' + audio.readyState)
        if (audio && audio.paused && audio.readyState === 4 && !video.paused) {
          console.log('timeupdate play audio')
          if (audio.paused) {
            audio.play();
          }
        }

        // autoplay情况下，如果因为直接走cache 而没有触发 canplay 事件，则需要纠正状态
        if (!isStarted && video.currentTime > 0) {
          onVideoStartPlay();
        }

        checkMuteStatus();

        // var showTime = Math.min(video.currentTime, video.duration);
        // var dru = durationFormat(Math.ceil(showTime));
        // $t.find($btnTime).text(dru);
        // var perc = (video.currentTime / video.duration) * 100;
        // $t.find($progress).css({
        //   'width': perc + '%'
        // });

        // 当中断后重新连接
        if (typeof stall !== 'undefined') {
          if (stall.toFixed(0) === video.currentTime.toFixed(0)) {
            console.log('stall and timeupdate stall value: ', stall);
          }
        }
      });


      // 全屏按钮点击
      $btnFull.tap(function () {
        console.log('entering full screen')
        launchFullscreen(video);
      })

      

      $t.on('h5Video:play', function(e){
        canPlayStarted = true;
        console.log('click playing')
        video.load();
        showFromStatus($btnLoading);
        video.play();

        opts.onClickPlay && opts.onClickPlay();
      })

      $t.on('h5Video:replay', function(e){
        canPlayStarted = true;
        console.log('click replaying')
        video.currentTime = 0;
        audio && (audio.currentTime = 0);
        video.play();

        opts.onClickPlay && opts.onClickPlay();
      })

      // 播放按钮点击，此btn只控制初次播放
      $btnPlay.tap(function () {
        $t.trigger('h5Video:play');
      })


      // 重播按钮点击
      $btnReplay.tap(function () {
        $t.trigger('h5Video:replay');
      })


      $w.on('resize', function () {
        resizeVideo();
      })


      return $t;
    }
  })



})(Zepto);
