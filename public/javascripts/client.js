let processor = null;
let localstream = null;
const socket = io.connect(); // サーバーとの接続を確立し、ioオブジェクトを取得

//let startTime; // 録音開始時刻を記録する変数
let durationInterval; // スペクトル表示のためのインターバルID
//let recordedData = []; // 録音データを保存する配列

let logAmplitudeData = []; // 対数スケールのパワースペクトルデータを保持する配列
let fftLogAmplitudew = [];
let iifftLogAmplitude =[];

var objChart = null;

const yAxisSettings = {
  min: -80,
  max: 40,
};

function drawGraph(data) {
  const dataLength = data.length / 4;
  const ffthalfLogAmplitudeData = data.slice(0, dataLength).map(value => value[0]);
  const halfLogAmplitudeData = logAmplitudeData.slice(0, dataLength);

  const ctx = document.getElementById('spectrum').getContext('2d');
 
  if (objChart !== null) {
    // 既存のChartを破棄
    objChart.destroy();
  } 

  objChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [...Array(ffthalfLogAmplitudeData.length).keys()],
      datasets: [
        {
          label: 'FFT Log Power Spectrum (dB)',
          borderColor: 'rgba(255, 0, 255, 1)',
          data: ffthalfLogAmplitudeData,
          fill: false,
        },
        {
          label: 'Log Power Spectrum (dB)',
          borderColor: 'rgba(0, 0, 255, 1)',
          data: halfLogAmplitudeData,
          fill: false,
        },
      ],
    },

    options: {
      responsive: true,
      animation: false,
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Frequency',
          },
        },

        y: {
          display: true,
          min: yAxisSettings.min,
          max: yAxisSettings.max,
          title: {
            display: true,
            text: 'Log Power (dB)',
          },
          ticks: {
            stepSize: 10,
          }
        },
      },
    },
  });
}

let btn = document.getElementById('a');
let btnn = document.getElementById('b');

function startRecording() {
  console.log('start recording');

  // 無効
  btn.disabled = true;
  btnn.disabled = false;

  //const context = new (window.AudioContext || window.webkitAudioContext)();
  const context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  const sampleRate = 16000;
  context.sampleRate = sampleRate;

  //const ctx = new AudioContext({ sampleRate: 16000 });
  //socket.emit('start', { sampleRate: sampleRate });
  socket.emit('start', sampleRate);

  const bufferSize = 1024;
  const numberOfInputChannels = 1;
  const numberOfOutputChannels = 1;
  
  processor = context.createScriptProcessor(bufferSize, numberOfInputChannels, numberOfOutputChannels);

  //startTime = Date.now(); // 開始時刻を記録

  navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then((stream) => {
    localstream = stream;
    const input = context.createMediaStreamSource(stream);
   
    processor.onaudioprocess = (e) => {
      const voice = e.inputBuffer.getChannelData(0);
      //console.log(voice);
      const pcmData = Array.from(voice, (sample) => Math.floor(sample * 32767)); // フロート値を[-32768, 32767]の範囲の整数値に変換
      //console.log("pcmdata:")
      //console.log(pcmData);
      socket.emit('send_pcm', pcmData);
    };
    socket.emit('calculate_fft');

    //対数スペクトルを描画
    socket.on('fft_result(log)',(logAmplitude) => {
      logAmplitudeData = logAmplitude;
      //console.log("logAmp:",logAmplitude);
    });

    //対数スペクトルをfftしたものを描画
    socket.on('ifft_result(fftlog)',(ifftLogAmplitude) => {
      //そのまま描画
      //fftLogAmplitudew = fftLogAmplitude
      
      //20番目から描画
      //let j = 0;

      //for(let i = 20;i<fftLogAmplitude.length;i++){
        //fftLogAmplitudew[j] = [fftLogAmplitude[i][0],fftLogAmplitude[i][1]];
        //j++;
      //}

      //20番目までに0を代入して描画
      for(let i = 0;i<15;i++){
        fftLogAmplitudew[i] = [0, 0];
      }
      
      for(i = 15;i<ifftLogAmplitude.length;i++){
        fftLogAmplitudew[i] = [ifftLogAmplitude[i][0],ifftLogAmplitude[i][1]];
      }

      //console.log("ifftlogamp:",ifftLogAmplitude)
      //drawGraph(objChart, fftLogAmplitudew);
    });

    //対数スペクトルをifftしたものを描画(包絡)
    socket.on('fft_result(fftlog)', fftLogAmp => {

      iifftLogAmplitude = fftLogAmp;
      //iifftLogAmplitude = fftLogAmp.map(complex => complex[0]);

      //console.log("fftLogAmp:",iifftLogAmplitude);

      drawGraph(iifftLogAmplitude);
    });

    input.connect(processor);
    processor.connect(context.destination);
  }).catch((e) => {
    // エラーハンドリング: マイクが利用できない場合の処理
    console.log(e);
  });
}



function stopRecording() {
  console.log('stop recording');

  // 有効
  btn.disabled = false;
  btnn.disabled = true;
  
  //if add
  if (processor) {
    processor.disconnect();
    processor.onaudioprocess = null;
    processor = null;
  }
  localstream.getTracks().forEach((track) => {
    track.stop();
  });
  socket.emit('stop', '', (res) => {
    console.log(`Audio data is saved as ${res.filename}`);
  });
  // スペクトル表示のためのインターバルをクリア
  clearInterval(durationInterval);
}

