const fft = require('fft-js').fft;
const ifft = require('fft-js').ifft;
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const houraku = [];

const writeFileAsync = promisify(fs.writeFile);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// publicディレクトリを静的ファイルのルートディレクトリとして設定
app.use('/', express.static(path.join(__dirname, 'public')));

const server = http.createServer(app).listen(3000, function () {
  console.log('Example app listening on port 3000');
});

const io = require('socket.io')(server);

//let recordedData = []; // 録音データを保存する配列

// クライアントとの接続イベント
io.on('connection', (socket) => {
  let sampleRate = 16000;
  let buffer = [];
  let wavbuf =[];
  let recordingStartTime = null; // 録音開始時刻を記録

  // 録音開始イベント
  socket.on('start', (data) => {
    //console.log(data);
    sampleRate = data;
    console.log(`Sample Rate: ${sampleRate}`);
    buffer = []; // 新しい録音のためにバッファをリセット
    recordingStartTime = Date.now(); // 録音開始時刻を記録
  });
  
  socket.on('send_pcm', (pcmData) => {
    const buf = new Int16Array(pcmData); // Int16Arrayを使用して適切な型の配列を作成する
    const itr = pcmData.values()
    const buff = new Array(pcmData.length)
      for (var i = 0; i < buff.length; i++) {
        buff[i] = itr.next().value
      }
    buffer = buf;
    wavbuf = wavbuf.concat(buff);
    //console.log(f32buf)    
  });
  
  // 録音停止イベント
  socket.on('stop', async (data, ack) => {
    const f32array = toF32Array(wavbuf);
    //console.log(f32array);
    //recordedData.push(fft(buffer)); // 録音データを保存
    const filename = generateUniqueFilename('public/wav', '.wav');
    //const wavBuffer = f32ArrayToWavBuffer(f32array, sampleRate);
    const wavBuffer = f32ArrayToWavBuffer(f32array, sampleRate);
    
    try {
      await writeFileAsync(filename, wavBuffer);
      ack({ filename: path.basename(filename) });
    } catch (error) {
      console.error('Error saving WAV file:', error);
      ack({ error: 'Failed to save WAV file.' });
    }

    console.log(filename)
    wavbuf = []; // バッファをリセット
    recordingStartTime = null; // 録音開始時刻をリセット
  });

  // 録音開始時刻に基づく一意のファイル名を生成
  const generateUniqueFilename = (directory, extension) => {
    const timestamp = recordingStartTime || Date.now(); // 録音開始時刻がなければ現在時刻を使用
    const datetime = new Date(timestamp);
    const formattedDatetime = datetime.toISOString().replace(/[-:.]/g, '');
    const filename = `${formattedDatetime}${extension}`;
    return path.join(directory, filename);
  };

  // 定期的にFFTを計算して結果をクライアントに送信
  const calculateAndSendFFT = () => {
    if (buffer.length > 0) {
      const f32array = toF32Array(buffer);

      const complexSignal = fft(f32array);

      const amplitude = complexSignal.map((c) => Math.sqrt(c[0] * c[0] + c[1] * c[1]));
      //console.log(amplitude)
      const logAmplitude = amplitude.map((value) => 20 * Math.log10(value));

      //console.log(amplitudeRestored);
      const logamp = logAmplitude.map(value => [value, 0]);

      //対数スペクトルをfft
      //const fftLogAmplitude = fft(logAmplitude);

      //
      const ifftLogAmplitude = ifft(logamp);
      //console.log("logamp:",logamp);
      //
      //console.log("ifftlogamp:",ifftLogAmplitude);

      socket.emit('fft_result(log)', logAmplitude);
      //console.log(fftLogAmplitude);
      socket.emit('ifft_result(fftlog)', ifftLogAmplitude);

      //console.log(fftLogAmplitude);

      // 20番目以降のデータを0に設定
      for (let i = 20; i < ifftLogAmplitude.length; i++) {
        ifftLogAmplitude[i][0] = 0; // 実部を0に設定
        ifftLogAmplitude[i][1] = 0; // 虚部は0のまま
      }

      const fftLogAmp = fft(ifftLogAmplitude);
      //console.log("fftLogAmp:",fftLogAmp);
      socket.emit('fft_result(fftlog)', fftLogAmp);

      buffer = []; // バッファをクリアして次のデータの準備
    }
  };

  // クライアントからのFFT計算リクエストを受け取る
  socket.on('calculate_fft', () => {
    calculateAndSendFFT();
  });

  // 定期的にFFT計算を行う間隔を設定（ここでは200ms）
  const fftInterval = setInterval(calculateAndSendFFT, 200);

  // クライアントとの接続が切断された場合にFFT計算のインターバルをクリアする
  socket.on('disconnect', () => {
    clearInterval(fftInterval);
  });
});

// Float32ArrayをInt16Arrayに変換
const toInt16Array = (f32array) => {
  const int16array = new Int16Array(f32array.length);
  for (let i = 0; i < f32array.length; i++) {
    int16array[i] = Math.max(-1, Math.min(f32array[i], 1) * 32767); // フロート値を[-1, 1]の範囲にクリップし、Int16にスケーリング
  }
  return int16array;
};

// Float32ArrayをWAVバッファに変換
const f32ArrayToWavBuffer = (f32array, sampleRate) => {

  // Float32ArrayからInt16Arrayへの変換（toInt16Array関数の実装は正しいものと仮定）
  const int16array = toInt16Array(f32array);

  // WAVデータを保持するためのArrayBufferを作成
  const bufferData = new ArrayBuffer(int16array.length * 2); // 2 bytes per sample (Int16)
  const view = new DataView(bufferData);

  // Int16ArrayのデータをArrayBufferにセット
  for (let i = 0; i < int16array.length; i++) {
    view.setInt16(i * 2, int16array[i], true); // バイトオーダーをリトルエンディアンで設定
  }


  const bytesPerSample = 2; // 16-bit audio
  const numChannels = 1; // Mono audio
  const blockAlign = bytesPerSample * numChannels;
  const byteRate = sampleRate * blockAlign;

  const wavBuffer = Buffer.from(bufferData);
  const wavHeader = Buffer.alloc(44);

  // WAVヘッダを設定
  wavHeader.write('RIFF', 0); // ChunkID
  wavHeader.writeUInt32LE(wavBuffer.length + 36, 4); // ChunkSize
  wavHeader.write('WAVE', 8); // Format
  wavHeader.write('fmt ', 12); // Subchunk1ID
  wavHeader.writeUInt32LE(16, 16); // Subchunk1Size
  wavHeader.writeUInt16LE(1, 20); // AudioFormat (PCM)
  wavHeader.writeUInt16LE(numChannels, 22); // NumChannels
  wavHeader.writeUInt32LE(sampleRate, 24); // SampleRate
  wavHeader.writeUInt32LE(byteRate, 28); // ByteRate
  wavHeader.writeUInt16LE(blockAlign, 32); // BlockAlign
  wavHeader.writeUInt16LE(bytesPerSample * 8, 34); // BitsPerSample
  wavHeader.write('data', 36); // Subchunk2ID
  wavHeader.writeUInt32LE(wavBuffer.length, 40); // Subchunk2Size

  return Buffer.concat([wavHeader, wavBuffer]);
};

// Int16ArrayをFloat32Arrayに変換
const toF32Array = (int16array) => {
  const f32array = new Float32Array(int16array.length);
  for (let i = 0; i < int16array.length; i++) {
    f32array[i] = int16array[i] / 32767; // Int16値を[-1, 1]の範囲にスケーリング
  }
  return f32array;
};