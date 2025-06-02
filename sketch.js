let fruits = [];
let currentFruit = null;
let radiusList = [150, 200, 255, 300, 355, 400]; // 只保留6個等級（直徑100,150,250,300,350,400）
let colors = ['#f99', '#f90', '#ff0', '#0f0', '#0ff', '#f0f']; // 6種顏色
let gravity = 0.3;

let video;
let facemesh;
let predictions = [];
let noseX = 200;
let mouthOpen = false;
let mouthJustClosed = false;
let gameOver = false;
let gameStarted = false; // 新增：遊戲是否開始

function setup() {
  createCanvas(windowWidth, windowHeight);
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

  // 顯示攝影機畫面
  image(video, width - 160, 10, 120, 90);

  // 畫1/10高度的紅線
  stroke(255, 0, 0);
  strokeWeight(3);
  let lineY = height / 10;
  line(0, lineY, width, lineY);
  noStroke();

  // ======= 開始畫面 =======
  if (!gameStarted) {
    fill(255);
    stroke(0);
    rectMode(CENTER);
    rect(width / 2, height / 2, 200, 100, 20);
    fill(0);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(32);
    text("開始遊戲", width / 2, height / 2);
    return;
  }

  // ======= 遊戲結束畫面 =======
  if (gameOver) {
    drawFruits(); // 只畫圓形，不更新
    textSize(64);
    fill(255, 0, 0);
    textAlign(CENTER, CENTER);
    text('Game Over', width / 2, height / 2 - 40);
    textSize(32);
    fill(0);
    text('點擊任一處重新開始', width / 2, height / 2 + 40);
    return; // 不再 updateFruits
  }

  detectFace();
  updateFruits();
  drawFruits();
}

function mousePressed() {
  if (!gameStarted) {
    // 點擊開始遊戲按鈕
    let btnX = width / 2, btnY = height / 2;
    if (mouseX > btnX - 100 && mouseX < btnX + 100 && mouseY > btnY - 50 && mouseY < btnY + 50) {
      startGame();
    }
  } else if (gameOver) {
    // 遊戲結束後點擊任一處重新開始
    startGame();
  }
}

function startGame() {
  fruits = [];
  currentFruit = null;
  gameOver = false;
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

  // === 不同大小圓形推開（只會邊框接觸） ===
  for (let i = 0; i < fruits.length; i++) {
    for (let j = i + 1; j < fruits.length; j++) {
      let a = fruits[i], b = fruits[j];
      if (a.level !== b.level) {
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
          }
          a.merged = true;
          b.merged = true;
          break; // 這一顆 a 已經合併，不要再跟其他水果合併
        }
      }
    }
  }

  // 移除已合併的水果
  fruits = fruits.filter(f => !f.merged);

  // === 判斷是否有圓碰到1/10高度的紅線 ===
  for (let fruit of fruits) {
    // 只判斷已經連續靜止6幀以上且已經通過紅線的圓
    if (
      fruit.passedLine &&
      fruit.stableCount > 5 &&
      fruit.y - fruit.radius <= lineY + 1
    ) {
      gameOver = true;
    }
  }

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
}
