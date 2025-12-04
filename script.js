// --- State Variables ---
let currentScreen = 'screen-welcome';
let sessionTimerInterval;
let printTimerInterval;
let retakeIndex = null; 
let capturedImages = [];
let selectedTemplate = 3; 
let videoStream = null;
let customFrameImg = null; 
let isBnwMode = false;

// --- Config ---
const CONFIG = {
    sessionTime: 5 * 60, 
    printTime: 3 * 60,   
    countDownTime: 5,    
    printWidth: 57,      // mm
    photoHeight: 30      // mm
};

// Variabel untuk menyimpan hasil scan otomatis
let detectedTemplates3 = [];
let detectedTemplates4 = [];

// --- DOM Elements ---
const screens = document.querySelectorAll('.screen');
const timerDisplay = document.getElementById('time-remaining');
const globalTimerBox = document.getElementById('global-timer');
const videoElement = document.getElementById('video-feed');
const canvas = document.getElementById('photo-canvas');
const ctx = canvas.getContext('2d');
const countdownOverlay = document.getElementById('countdown-overlay');
const previewImage = document.getElementById('preview-image');
const finalImage = document.getElementById('final-image');
const printTimerDisplay = document.getElementById('print-timer');

// --- AUTO SCANNER (Jalankan saat awal) ---
function initAutoScan() {
    // Scan asset 3_1.png dst
    scanFiles('3', 1, detectedTemplates3);
    // Scan asset 4_1.png dst
    scanFiles('4', 1, detectedTemplates4);
}

function scanFiles(type, index, targetArray) {
    const filename = `${type}_${index}.png`; // misal 3_1.png
    const path = `assets/${filename}`;
    const img = new Image();
    
    img.onload = function() {
        targetArray.push(filename); 
        scanFiles(type, index + 1, targetArray); // Lanjut cek nomor berikutnya
    };
    img.onerror = function() {
        // Stop scanning jika file tidak ditemukan
        console.log(`Scan ${type} selesai. Total: ${targetArray.length}`);
    };
    img.src = path;
}

// Jalankan Scanner
initAutoScan();


// --- Navigation ---
function showScreen(screenId) {
    // Pastikan selector mengambil semua screen yang benar
    const allScreens = document.querySelectorAll('.screen');
    allScreens.forEach(s => s.classList.remove('active'));
    
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
        currentScreen = screenId;
    } else {
        console.error("Screen ID not found:", screenId);
    }
}

// --- Filter Logic ---
function setFilterMode(mode) {
    isBnwMode = (mode === 'bnw');
}

// --- FLOW ALUR BARU ---

// 1. Tombol Mulai (Welcome Screen)
function startSession() {
    startGlobalTimer(CONFIG.sessionTime);
    globalTimerBox.classList.remove('hidden');
    // MASUK KE PILIH JUMLAH STRIP
    showScreen('screen-strip-select');
}

// 2. Pilih Jumlah Strip (3 atau 4)
function selectStripCount(num) {
    selectedTemplate = num;
    // MASUK KE GALERI TEMPLATE
    renderTemplateGallery(num);
    showScreen('screen-template-choice');
}

// 3. Render Galeri
function renderTemplateGallery(num) {
    const galleryContainer = document.getElementById('assets-gallery');
    galleryContainer.innerHTML = ''; 

    // Ambil data dari hasil scan
    const list = (num === 3) ? detectedTemplates3 : detectedTemplates4;

    if (list.length === 0) {
        galleryContainer.innerHTML = '<p style="color:#888;">Tidak ada template bawaan (Cek folder assets).</p>';
        return;
    }

    list.forEach(filename => {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        // Saat diklik, load frame dan mulai kamera
        div.onclick = () => loadPremadeFrame('assets/' + filename);

        const img = document.createElement('img');
        img.src = 'assets/' + filename;
        img.style.width = '100px'; // Styling inline simple
        img.style.margin = '5px';
        img.style.cursor = 'pointer';
        
        div.appendChild(img);
        galleryContainer.appendChild(div);
    });
}

// 4a. Load Template Bawaan
function loadPremadeFrame(path) {
    const img = new Image();
    img.onload = () => {
        customFrameImg = img;
        startCameraSequence();
    };
    img.onerror = () => alert("Gagal memuat template.");
    img.src = path;
}

// 4b. Upload Template Custom
function handleCustomUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = () => {
                customFrameImg = img;
                startCameraSequence();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// 5. Masuk ke Kamera
function startCameraSequence() {
    capturedImages = [];
    retakeIndex = null;
    showScreen('screen-capture');
    startCamera();
}


// --- Camera Logic ---
async function startCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, 
            audio: false 
        });
        videoElement.srcObject = videoStream;
        
        // Apply Filter Live
        videoElement.style.filter = isBnwMode ? 'grayscale(100%) contrast(1.1)' : 'none';

        setTimeout(() => runPhotoSequence(), 1000);
    } catch (err) {
        alert("Gagal kamera: " + err);
    }
}

async function runPhotoSequence() {
    if (retakeIndex !== null) {
        // Mode Retake
        document.getElementById('photo-instruction').innerText = `Mengulang Foto ke-${retakeIndex + 1}`;
        await doCountdown();
        
        // Flash
        videoElement.style.opacity = 0;
        setTimeout(() => videoElement.style.opacity = 1, 100);

        const imgData = captureFrame();
        capturedImages[retakeIndex] = imgData; 
        retakeIndex = null; 
    } else {
        // Mode Normal Sequence
        capturedImages = []; 
        for (let i = 1; i <= selectedTemplate; i++) {
            document.getElementById('photo-instruction').innerText = `Foto ke-${i} dari ${selectedTemplate}`;
            await doCountdown();
            
            videoElement.style.opacity = 0;
            setTimeout(() => videoElement.style.opacity = 1, 100);

            const imgData = captureFrame();
            capturedImages.push(imgData);
            
            if(i < selectedTemplate) await new Promise(r => setTimeout(r, 1000));
        }
    }

    stopCamera();
    await generateStrip(); 
    renderRetakeThumbnails();
    showScreen('screen-preview');
}

function doCountdown() {
    return new Promise(resolve => {
        let count = CONFIG.countDownTime;
        countdownOverlay.classList.remove('hidden');
        countdownOverlay.innerText = count;

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownOverlay.innerText = count;
            } else {
                clearInterval(interval);
                countdownOverlay.classList.add('hidden');
                resolve();
            }
        }, 1000);
    });
}

// --- Capture Frame (Fix B&W & Ratio) ---
function captureFrame() {
    const targetRatio = CONFIG.printWidth / CONFIG.photoHeight; 
    const videoW = videoElement.videoWidth;
    const videoH = videoElement.videoHeight;
    const videoRatio = videoW / videoH;

    let cropW, cropH, cropX, cropY;

    if (videoRatio > targetRatio) {
        cropH = videoH;
        cropW = videoH * targetRatio;
        cropX = (videoW - cropW) / 2;
        cropY = 0;
    } else {
        cropW = videoW;
        cropH = videoW / targetRatio;
        cropX = 0;
        cropY = (videoH - cropH) / 2;
    }

    canvas.width = 1000;
    canvas.height = 1000 / targetRatio;

    // Mirroring
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    ctx.save(); 
    if (isBnwMode) {
        ctx.filter = 'grayscale(100%) contrast(1.1)';
    }

    ctx.drawImage(
        videoElement, 
        cropX, cropY, cropW, cropH,     
        0, 0, canvas.width, canvas.height 
    );

    ctx.restore(); 
    return canvas.toDataURL('image/png');
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
}

// --- Helper Image Loader ---
const loadImage = (src) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img); 
        img.onerror = reject;
        img.src = src;
    });
};

// --- Generate Strip (Fix B&W Leak) ---
async function generateStrip() {
    const pxPerMm = 11.8;
    const slotW_mm = CONFIG.printWidth; 
    const slotH_mm = CONFIG.photoHeight; 
    const gap_mm = 8;
    const topMargin_mm = 10;
    const bottomMargin_mm = 20;
    const padding_mm = 1; 

    const stripWidth = Math.round(slotW_mm * pxPerMm);   
    const slotHeight = Math.round(slotH_mm * pxPerMm);  
    const gap = Math.round(gap_mm * pxPerMm);             
    const headerHeight = Math.round(topMargin_mm * pxPerMm); 
    const footerHeight = Math.round(bottomMargin_mm * pxPerMm); 
    const paddingPx = Math.round(padding_mm * pxPerMm);

    const totalHeight = headerHeight + (slotHeight * selectedTemplate) + (gap * (selectedTemplate - 1)) + footerHeight;

    canvas.width = stripWidth;
    canvas.height = totalHeight;

    // Background Putih
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Header (Jika tanpa custom frame)
    if (!customFrameImg) {
        ctx.fillStyle = "#FF85A2"; 
        ctx.font = "bold 30px 'Fredoka One'";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle"; 
        ctx.fillText("FotoSeru ✨", stripWidth / 2, headerHeight / 2);
    }

    try {
        const loadedImages = await Promise.all(capturedImages.map(src => loadImage(src)));
        
        let currentY = headerHeight; 
        const imgW = stripWidth - (paddingPx * 2); 
        const imgH = slotHeight - (paddingPx * 2);

        loadedImages.forEach((img) => {
            const drawX = paddingPx;
            const drawY = currentY + paddingPx;

            ctx.save(); 
            if (isBnwMode) {
                ctx.filter = 'grayscale(100%) contrast(1.1)';
            }
            ctx.drawImage(img, drawX, drawY, imgW, imgH);
            ctx.restore(); 

            // Border Hijau (Jika tanpa custom frame)
            if (!customFrameImg) {
                ctx.strokeStyle = "#CBF0E0"; 
                ctx.lineWidth = 5;
                ctx.strokeRect(drawX, drawY, imgW, imgH);
            }
            
            currentY += slotHeight + gap;
        });

        // Overlay Custom Frame
        if (customFrameImg) {
            ctx.drawImage(customFrameImg, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.textBaseline = "alphabetic"; 
            ctx.fillStyle = "#aaa";
            ctx.font = "15px 'Quicksand'";
            ctx.fillText(new Date().toLocaleDateString('id-ID'), stripWidth / 2, totalHeight - (footerHeight / 2));
        }

        const finalDataUrl = canvas.toDataURL('image/png');
        previewImage.src = finalDataUrl;
        finalImage.src = finalDataUrl;

    } catch (error) {
        console.error("Generate error:", error);
    }
}

// --- Timer & Logic Lain ---
function startGlobalTimer(duration) {
    clearInterval(sessionTimerInterval);
    let timer = duration;
    updateTimerDisplay(timer, timerDisplay);

    sessionTimerInterval = setInterval(() => {
        timer--;
        updateTimerDisplay(timer, timerDisplay);
        
        if (timer <= 0) {
            clearInterval(sessionTimerInterval);
            if (capturedImages.length > 0) {
                alert("Waktu sesi habis!");
                stopCamera();
                generateStrip(); 
                finalizeSession(); 
            } else {
                alert("Waktu habis.");
                resetApp();
            }
        }
    }, 1000);
}

function updateTimerDisplay(seconds, element) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    element.textContent = `${m}:${s}`;
}

// --- Retake & Print ---
function renderRetakeThumbnails() {
    const container = document.getElementById('thumbnails-container');
    container.innerHTML = ''; 
    capturedImages.forEach((imgSrc, index) => {
        const card = document.createElement('div');
        card.className = 'thumb-card';
        card.onclick = () => initRetakeSingle(index); 
        const img = document.createElement('img');
        img.src = imgSrc;
        card.appendChild(img);
        container.appendChild(card);
    });
}

function initRetakeSingle(index) {
    retakeIndex = index; 
    showScreen('screen-capture'); 
    startCamera(); 
}

function retakeAll() {
    // Balik ke pilih template/kamera
    retakeIndex = null;
    showScreen('screen-strip-select'); // atau screen-template-choice
}

function finalizeSession() {
    clearInterval(sessionTimerInterval); 
    globalTimerBox.classList.add('hidden');
    showScreen('screen-print');
    startPrintTimer();
}

function startPrintTimer() {
    let timer = CONFIG.printTime;
    updateTimerDisplay(timer, printTimerDisplay);
    printTimerInterval = setInterval(() => {
        timer--;
        updateTimerDisplay(timer, printTimerDisplay);
        if (timer <= 0) finishSession();
    }, 1000);
}

function downloadImage() {
    const link = document.createElement('a');
    link.download = 'foto-seru-' + Date.now() + '.png';
    link.href = finalImage.src;
    link.click();
}

function printImage() { window.print(); }

function finishSession() {
    clearInterval(printTimerInterval);
    showScreen('screen-thankyou');
}

function resetApp() {
    clearInterval(sessionTimerInterval);
    clearInterval(printTimerInterval);
    currentScreen = 'screen-welcome';
    capturedImages = [];
    customFrameImg = null; // Reset frame
    showScreen('screen-welcome');
}