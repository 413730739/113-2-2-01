let fruits = [];
let currentFruit = null;
let radiusList = [];
let colors = ['#f99', '#f90', '#ff0', '#0f0', '#0ff', '#f0f'];
let gravity = 0.3;

let video;
let facemesh;
let predictions = [];
let noseX = 200;
let mouthOpen = false;
let mouthJustClosed = false;
let gameOver = false;
let gameStarted = false;
let win = false;

function setup() {
  createCanvas(windowWidth, windowHeight);
  radiusList = getRadiusList();
  video = createCapture(VIDEO);
  video.size(320, 240);
  video.hide();
  facemesh = ml5.facemesh(video, modelReady);
  facemesh.on('predict', gotResults);
}

function modelReady() {}

function gotResults(results) {
  predictions = results;
}

function draw() {
  background(240);

  // 攝影機縮圖依比例
  let camW = width * 0.15;
  let camH = height * 0.15;
  image(video, width - camW - 10, 10, camW, camH);

  // 紅線高度依比例
  stroke(255, 0, 0);
  strokeWeight(max(2, width * 0.005));
  let lineY = height / 10;
  line(0, lineY, width, lineY);
  noStroke();

  // ======= 開始畫面 =======
  if (!gameStarted) {
    fill(255);
    stroke(0);
    rectMode(CENTER);
    rect(width / 2, height / 2, width * 0.25, height * 0.12, 20);
    fill(0);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(width * 0.04);
    text("開始遊戲", width / 2, height / 2);
    return;
  }

  // ======= 遊戲結束畫面 =======
  if (gameOver) {
    drawFruits();
    textSize(width * 0.08);
    fill(255, 0, 0);
    textAlign(CENTER, CENTER);
    text('Game Over', width / 2, height / 2 - height * 0.05);
    textSize(width * 0.04);
    fill(0);
    text('點擊任一處重新開始', width / 2, height / 2 + height * 0.05);
    return;
  }

  // ======= 勝利畫面 =======
  if (win) {
    drawFruits();
    textSize(width * 0.08);
    fill('#a0f');
    textAlign(CENTER, CENTER);
    text('你贏了！', width / 2, height / 2 - height * 0.05);
    textSize(width * 0.04);
    fill(0);
    text('點擊任一處重新開始', width / 2, height / 2 + height * 0.05);
    return;
  }

  detectFace();
  updateFruits();
  drawFruits();

  // 勝利判斷
  let maxLevel = radiusList.length - 1;
  let bigCount = fruits.filter(f => f.level === maxLevel).length;
  if (bigCount >= 3) {
    win = true;
  }
}

function mousePressed() {
  if (!gameStarted) {
    // 點擊開始遊戲按鈕
    let btnX = width / 2, btnY = height / 2;
    if (mouseX > btnX - 100 && mouseX < btnX + 100 && mouseY > btnY - 50 && mouseY < btnY + 50) {
      startGame();
    }
  } else if (gameOver || win) {
    // 遊戲結束或勝利後點擊任一處重新開始
    startGame();
  }
}

function startGame() {
  fruits = [];
  currentFruit = null;
  gameOver = false;
  win = false;
  gameStarted = true;
  dropNewFruit();
}

function detectFace() {
  if (predictions.length > 0) {
    let keypoints = predictions[0].scaledMesh;
    // 鼻子座標控制水果掉落位置
    let nose = keypoints[1];
    noseX = map(nose[0], 0, video.width, 0, width);
    noseX = constrain(noseX, radiusList[0], width - radiusList[0]);

    // 嘴巴開合偵測
    let topLip = keypoints[13];
    let bottomLip = keypoints[14];
    let mouthOpenDist = dist(topLip[0], topLip[1], bottomLip[0], bottomLip[1]);

    if (mouthOpenDist > 20) {
      mouthOpen = true;
      mouthJustClosed = false;
    } else {
      if (mouthOpen && !mouthJustClosed && currentFruit) {
        // 嘴巴剛閉合，投擲水果
        currentFruit = null;
        dropNewFruit();
        mouthJustClosed = true;
      }
      mouthOpen = false;
    }
  }
}

function dropNewFruit() {
  let level = floor(random(2)); // 初始只出現前兩種
  currentFruit = createFruit(noseX, 30, level);
  fruits.push(currentFruit);
}

function createFruit(x, y, level) {
  return {
    x: x,
    y: y,
    vx: 0,
    vy: 0,
    level: level,
    radius: radiusList[level],
    color: colors[level],
    merged: false,
    stableCount: 0, // 記錄靜止幀數
    touchLineCount: 0, // 新增：碰到紅線次數
    _wasTouchingLine: false // 新增：避免一幀內多次累加
  };
}

function updateFruits() {
  let lineY = height / 10;
  for (let fruit of fruits) {
    // 只有 currentFruit 由臉控制 x，其餘正常物理
    if (fruit === currentFruit) {
      fruit.x = noseX;
    }
    if (fruit !== currentFruit || fruit.y < height - fruit.radius) {
      fruit.vy += gravity;
      fruit.y += fruit.vy;
      fruit.x += fruit.vx;

      // 地板碰撞
      if (fruit.y > height - fruit.radius) {
        fruit.y = height - fruit.radius;
        fruit.vy = 0;
      }

      // 邊界
      if (fruit.x < fruit.radius || fruit.x > width - fruit.radius) {
        fruit.vx *= -0.5;
        fruit.x = constrain(fruit.x, fruit.radius, width - fruit.radius);
      }
    }

    // 判斷是否真的穩定
    if (fruit.vy === 0 && Math.abs(fruit.vx) < 0.01) {
      fruit.stableCount = (fruit.stableCount || 0) + 1;
    } else {
      fruit.stableCount = 0;
    }

    // 新增：每次圓頂端碰到紅線就累加
    if (fruit.y - fruit.radius <= lineY + 1) {
      if (!fruit._wasTouchingLine) {
        fruit.touchLineCount = (fruit.touchLineCount || 0) + 1;
        fruit._wasTouchingLine = true;
      }
    } else {
      fruit._wasTouchingLine = false;
    }
  }

  // === 所有圓形都推開（不會重疊） ===
  for (let i = 0; i < fruits.length; i++) {
    for (let j = i + 1; j < fruits.length; j++) {
      let a = fruits[i], b = fruits[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let distAB = sqrt(dx * dx + dy * dy);
      let minDist = a.radius + b.radius;
      if (distAB < minDist && distAB > 0.1) {
        // 推開彼此
        let overlap = minDist - distAB;
        let pushX = (dx / distAB) * overlap * 0.5;
        let pushY = (dy / distAB) * overlap * 0.5;
        a.x += pushX;
        a.y += pushY;
        b.x -= pushX;
        b.y -= pushY;
      }
    }
  }

  // 合併水果（同級才合併）
  for (let i = 0; i < fruits.length; i++) {
    let a = fruits[i];
    if (a.merged) continue;
    for (let j = i + 1; j < fruits.length; j++) {
      let b = fruits[j];
      if (b.merged) continue;
      if (a.level === b.level) {
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distAB = sqrt(dx * dx + dy * dy);
        if (distAB < a.radius + b.radius) {
          let newLevel = a.level + 1;
          if (newLevel < radiusList.length) {
            let newFruit = createFruit((a.x + b.x) / 2, (a.y + b.y) / 2, newLevel);
            fruits.push(newFruit);
            a.merged = true;
            b.merged = true;
          }
          // 最大等級不合併也不消失
          break;
        }
      }
    }
  }

  // 移除已合併的水果
  fruits = fruits.filter(f => !f.merged);

  // === 判斷是否有圓第2次碰到紅線且已經穩定 ===
  for (let fruit of fruits) {
    if (
      fruit.touchLineCount >= 2 &&
      fruit.stableCount > 5
    ) {
      gameOver = true;
    }
  }
}

function drawFruits() {
  for (let fruit of fruits) {
    fill(fruit.color);
    noStroke();
    circle(fruit.x, fruit.y, fruit.radius * 2);
  }

  // 投擲提示線
  if (currentFruit) {
    stroke(0);
    line(noseX, 0, noseX, 50);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  radiusList = getRadiusList();
}

// 以視窗寬度為基準動態產生半徑
function getRadiusList() {
  let base = min(windowWidth, windowHeight);
  return [
    base * 0.07,
    base * 0.09,
    base * 0.11,
    base * 0.13,
    base * 0.15,
    base * 0.17
  ];
}
