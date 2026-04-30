// 游戏主类
class Game {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.player = null;
        this.leftJoystick = null;
        this.rightJoystick = null;
        this.moveVector = new THREE.Vector3();
        
        // 玩家颜色配置
        this.playerColors = {
            sheep: {
                body: 0x4169E1, // 皇家蓝
                pants: 0x1E90FF, // 道奇蓝
                skin: 0xFFCC99  // 肤色
            },
            wolf: {
                body: 0xDC143C, // 深红
                pants: 0x8B0000, // 暗红
                skin: 0xFFCC99  // 肤色
            }
        };

        // 身份系统
        this.playerRole = 'sheep'; // 'sheep' 或 'wolf'
        this.roleHats = {};
        this.playerLives = 2; // 玩家生命值（第一次被抓变狼，第二次才淘汰）
        this.isBound = false; // 是否被捆绑
        this.boundChair = null; // 被捆绑的椅子

        // 游戏状态
        this.gameState = 'lobby'; // 'lobby', 'hiding', 'playing', 'ended'
        this.hidingTimeLeft = 30; // 躲藏时间30秒
        this.timerInterval = null;
        this.gameTime = 1200; // 游戏时间20分钟
        this.gameTimerInterval = null;

        // 钩子系统
        this.hookSystem = {
            active: false,
            line: null,
            target: null,
            aiming: false,
            aimingLine: null,
            cooldown: 0,
            maxCooldown: 20 // 20秒冷却
        };

        // 加速技能
        this.speedBoost = {
            active: false,
            cooldown: 0,
            maxCooldown: 20, // 20秒冷却
            duration: 5, // 持续5秒
            multiplier: 1.8 // 速度倍数
        };

        // 解救系统
        this.rescueSystem = {
            active: false,
            progress: 0,
            target: null,
            requiredTime: 10 // 需要10秒
        };

        // 道具系统
        this.items = [];
        this.itemSpawnInterval = null;
        this.activeItems = {
            speedBoost: false,
            extraLife: false,
            invisibility: false,
            purification: false
        };

        // 多人系统
        this.roomCode = null;
        this.playerId = null;
        this.players = new Map(); // 存储所有玩家
        this.isHost = false;

        // 门系统
        this.doors = [];

        this.init();
    }

    init() {
        // 初始化Three.js场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // 天空蓝

        // 设置相机 - 固定视角跟随
        this.camera = new THREE.PerspectiveCamera(
            65, // FOV设置为65度，减少眩晕感
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        
        // 相机配置
        this.cameraConfig = {
            distance: 7, // 距离角色7米
            height: 3.5, // 高度3.5米
            smoothing: 0.1 // 平滑系数
        };

        // 初始化渲染器
        const canvas = document.getElementById('gameCanvas');
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 使用软阴影

        // 添加光源
        this.addLights();

        // 创建基础场景元素
        this.createGround();
        this.createPlayer();

        // 初始化摇杆
        this.initJoysticks();

        // 初始化游戏状态
        this.gameState = 'hiding'; // 'hiding', 'playing'
        this.hidingTimeLeft = 30; // 躲藏时间30秒

        // 开始躲藏倒计时
        this.startHidingTimer();

        // 初始化钩子系统
        this.initHookSystem();

        // 开始渲染循环
        this.animate();

        // 监听窗口大小变化
        window.addEventListener('resize', () => this.onWindowResize());

        // 防止移动端浏览器默认触摸行为
        this.preventTouchScroll();

        // 初始化玩家当前楼层
        this.currentFloor = 0; // 0表示地面层

        // 初始化键盘控制
        this.setupKeyboardControls();
    }

    setupKeyboardControls() {
        // 键盘事件监听
        document.addEventListener('keydown', (event) => {
            // 楼层切换控制
            switch(event.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    event.preventDefault();
                    // 尝试上楼
                    this.attemptFloorChange(1);
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    event.preventDefault();
                    // 尝试下楼
                    this.attemptFloorChange(-1);
                    break;
                case ' ': // 空格键 - 跳跃
                    event.preventDefault();
                    if (this.currentFloor >= 2) { // 只有在高层才能跳
                        this.jumpFromRoof();
                    }
                    break;
                case '1': // 数字键选择楼层
                    event.preventDefault();
                    this.goToFloor(0);
                    break;
                case '2':
                    event.preventDefault();
                    this.goToFloor(1);
                    break;
                case '3':
                    event.preventDefault();
                    this.goToFloor(2);
                    break;
            }
        });
    }

    attemptFloorChange(direction) {
        // 尝试改变楼层，需要靠近楼梯或电梯
        const targetFloor = this.currentFloor + direction;

        // 检查是否有可用的楼梯
        if (this.stairs) {
            for (const stair of this.stairs) {
                const distance = this.player.position.distanceTo(stair.object.position);

                if (distance < 2) { // 在楼梯附近
                    if (direction > 0 && targetFloor <= stair.destination.floor) {
                        // 上楼
                        this.goUpstairs(stair);
                        return;
                    } else if (direction < 0 && targetFloor >= 0) {
                        // 下楼
                        this.goDownstairs(stair);
                        return;
                    }
                }
            }
        }

        // 如果不在楼梯附近，给出提示
        if (direction > 0) {
            this.showFloorChangeMessage("请靠近楼梯再上楼");
        } else {
            this.showFloorChangeMessage("请靠近楼梯再下楼");
        }
    }

    goToFloor(floor) {
        // 直接到指定楼层（需要玩家在楼梯附近）
        if (floor === this.currentFloor) {
            this.showFloorChangeMessage(`已在第${floor + 1}层`);
            return;
        }

        // 寻找合适的楼梯
        if (this.stairs) {
            for (const stair of this.stairs) {
                const distance = this.player.position.distanceTo(stair.object.position);

                if (distance < 2) { // 在楼梯附近
                    if (floor > this.currentFloor) {
                        this.goUpstairs(stair);
                    } else if (floor < this.currentFloor) {
                        this.goDownstairs(stair);
                    }
                    return;
                }
            }
        }

        // 没有楼梯提示
        this.showFloorChangeMessage("请靠近楼梯再切换楼层");
    }

    initHookSystem() {
        // 创建用于瞄准线的画布
        this.setupAimingCanvas();
    }

    setupAimingCanvas() {
        // 创建Canvas元素用于绘制瞄准线
        const aimingCanvas = document.createElement('canvas');
        aimingCanvas.id = 'aimingCanvas';
        aimingCanvas.style.position = 'absolute';
        aimingCanvas.style.top = '0';
        aimingCanvas.style.left = '0';
        aimingCanvas.style.pointerEvents = 'none';
        aimingCanvas.style.zIndex = '50';
        aimingCanvas.width = window.innerWidth;
        aimingCanvas.height = window.innerHeight;

        document.getElementById('gameContainer').appendChild(aimingCanvas);

        this.aimingCanvas = aimingCanvas;
        this.aimingCtx = aimingCanvas.getContext('2d');

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.aimingCanvas.width = window.innerWidth;
            this.aimingCanvas.height = window.innerHeight;
        });
    }

    startHidingTimer() {
        // 更新UI显示
        const timerElement = document.getElementById('timer');
        if (timerElement) {
            timerElement.textContent = `${this.hidingTimeLeft}s`;
        }

        // 启动倒计时
        this.timerInterval = setInterval(() => {
            this.hidingTimeLeft--;

            if (timerElement) {
                timerElement.textContent = `${this.hidingTimeLeft}s`;
            }

            if (this.hidingTimeLeft <= 0) {
                this.endHidingPhase();
            }
        }, 1000);
    }

    endHidingPhase() {
        clearInterval(this.timerInterval);

        // 切换到游戏进行状态
        this.gameState = 'playing';

        // 更新UI
        const timerElement = document.getElementById('timer');
        if (timerElement) {
            timerElement.textContent = 'GO!';
        }

        // 3秒后开始游戏计时
        setTimeout(() => {
            if (this.gameState === 'playing') {
                this.startGameTimer();
            }
        }, 3000);
    }

    startGameTimer() {
        // 更新UI显示游戏时间
        const timerElement = document.getElementById('timer');
        
        const updateTimer = () => {
            if (timerElement) {
                const minutes = Math.floor(this.gameTime / 60);
                const seconds = this.gameTime % 60;
                timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        };

        updateTimer();

        // 启动游戏倒计时
        this.gameTimerInterval = setInterval(() => {
            this.gameTime--;
            updateTimer();

            if (this.gameTime <= 0) {
                this.endGame('time_up');
            }
        }, 1000);
    }

    endGame(reason) {
        // 停止所有计时器
        clearInterval(this.timerInterval);
        clearInterval(this.gameTimerInterval);

        // 设置游戏状态为结束
        this.gameState = 'ended';

        // 显示游戏结果
        let resultMessage = '';
        if (reason === 'time_up') {
            // 时间到，羊获胜
            resultMessage = this.playerRole === 'sheep' ? '恭喜！你成功逃脱了！' : '时间到！羊逃脱了！';
        } else if (reason === 'all_caught') {
            // 所有羊被抓住，狼获胜
            resultMessage = this.playerRole === 'wolf' ? '恭喜！你抓住了所有羊！' : '你被抓住了！';
        }

        // 显示结果UI
        this.showGameResult(resultMessage);
    }

    showGameResult(message) {
        // 创建结果显示UI
        const resultDiv = document.createElement('div');
        resultDiv.style.position = 'absolute';
        resultDiv.style.top = '50%';
        resultDiv.style.left = '50%';
        resultDiv.style.transform = 'translate(-50%, -50%)';
        resultDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        resultDiv.style.color = 'white';
        resultDiv.style.padding = '30px 50px';
        resultDiv.style.borderRadius = '10px';
        resultDiv.style.fontSize = '24px';
        resultDiv.style.textAlign = 'center';
        resultDiv.style.zIndex = '300';

        resultDiv.innerHTML = `
            <div style="margin-bottom: 20px;">${message}</div>
            <button id="restartButton" style="
                padding: 10px 30px;
                font-size: 18px;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
            ">重新开始</button>
        `;

        document.getElementById('gameContainer').appendChild(resultDiv);

        // 添加重新开始按钮事件
        document.getElementById('restartButton').addEventListener('click', () => {
            location.reload(); // 刷新页面重新开始
        });
    }

    checkWinCondition() {
        // 检查胜利条件
        // 注意：在单人测试模式下，不检查胜利条件
        // 只有在多人模式下才检查所有羊是否被抓
        
        // 如果是多人模式，检查所有玩家
        if (this.players && this.players.size > 1) {
            if (this.playerRole === 'wolf') {
                // 狼的胜利条件：抓住所有羊
                let allSheepCaught = true;
                this.players.forEach((player, id) => {
                    if (player.role === 'sheep' && !player.isBound) {
                        allSheepCaught = false;
                    }
                });
                
                if (allSheepCaught) {
                    this.endGame('all_caught');
                }
            }
        }
        // 羊的胜利条件：时间到时未被抓住（已在endGame中处理）
    }

    preventTouchScroll() {
        // 禁止页面滚动和缩放
        document.addEventListener('touchmove', function(e) {
            if (e.target.id !== 'gameCanvas') return;
            e.preventDefault();
        }, { passive: false });

        // 禁止双击缩放
        let lastTouchEnd = 0;
        document.addEventListener('touchend', function(e) {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    }

    // ... 其他方法保持不变 ...

    createPlayer() {
        // 创建一个方块人角色
        this.player = new THREE.Group();
        
        // 根据角色类型选择颜色
        const colors = this.playerColors[this.playerRole];

        // 身体
        const bodyGeometry = new THREE.BoxGeometry(0.8, 1.2, 0.4);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: colors.body });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 1.5;
        body.castShadow = true;
        body.name = 'body';
        this.player.add(body);

        // 头部
        const headGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const headMaterial = new THREE.MeshLambertMaterial({ color: colors.skin });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 2.2;
        head.castShadow = true;
        head.name = 'head';
        this.player.add(head);

        // 左臂
        const leftArmGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
        const leftArmMaterial = new THREE.MeshLambertMaterial({ color: colors.body });
        const leftArm = new THREE.Mesh(leftArmGeometry, leftArmMaterial);
        leftArm.position.set(-0.55, 1.6, 0);
        leftArm.castShadow = true;
        this.player.add(leftArm);

        // 右臂
        const rightArmGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
        const rightArmMaterial = new THREE.MeshLambertMaterial({ color: colors.body });
        const rightArm = new THREE.Mesh(rightArmGeometry, rightArmMaterial);
        rightArm.position.set(0.55, 1.6, 0);
        rightArm.castShadow = true;
        this.player.add(rightArm);

        // 左腿
        const leftLegGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
        const leftLegMaterial = new THREE.MeshLambertMaterial({ color: colors.pants });
        const leftLeg = new THREE.Mesh(leftLegGeometry, leftLegMaterial);
        leftLeg.position.set(-0.25, 0.5, 0);
        leftLeg.castShadow = true;
        this.player.add(leftLeg);

        // 右腿
        const rightLegGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
        const rightLegMaterial = new THREE.MeshLambertMaterial({ color: colors.pants });
        const rightLeg = new THREE.Mesh(rightLegGeometry, rightLegMaterial);
        rightLeg.position.set(0.25, 0.5, 0);
        rightLeg.castShadow = true;
        this.player.add(rightLeg);

        // 创建帽子（用于身份标识）
        this.createRoleHats();

        // 默认位置
        this.player.position.y = 0;
        this.scene.add(this.player);

        // 设置相机初始位置
        this.camera.position.set(
            this.player.position.x,
            this.player.position.y + this.cameraConfig.height,
            this.player.position.z + this.cameraConfig.distance
        );
        this.camera.lookAt(this.player.position);
    }

    createRoleHats() {
        // 羊的帽子（羊角形状）
        const sheepHatGroup = new THREE.Group();
        
        // 羊角（弯曲的角）
        const hornCurve1 = new THREE.CatmullRomCurve3([
            new THREE.Vector3(-0.2, 0, 0),
            new THREE.Vector3(-0.3, 0.3, 0),
            new THREE.Vector3(-0.2, 0.6, 0.1),
            new THREE.Vector3(-0.1, 0.8, 0.15)
        ]);
        
        const hornGeometry1 = new THREE.TubeGeometry(hornCurve1, 20, 0.08, 8, false);
        const hornMaterial = new THREE.MeshLambertMaterial({ color: 0xF5DEB3 }); // 米色羊角
        
        const leftHorn = new THREE.Mesh(hornGeometry1, hornMaterial);
        leftHorn.position.set(-0.15, 2.5, 0);
        sheepHatGroup.add(leftHorn);
        
        // 右角（镜像）
        const hornCurve2 = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0.2, 0, 0),
            new THREE.Vector3(0.3, 0.3, 0),
            new THREE.Vector3(0.2, 0.6, 0.1),
            new THREE.Vector3(0.1, 0.8, 0.15)
        ]);
        
        const hornGeometry2 = new THREE.TubeGeometry(hornCurve2, 20, 0.08, 8, false);
        const rightHorn = new THREE.Mesh(hornGeometry2, hornMaterial);
        rightHorn.position.set(0.15, 2.5, 0);
        sheepHatGroup.add(rightHorn);
        
        // 羊耳朵
        const earGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        earGeometry.scale(1, 0.5, 0.3);
        const earMaterial = new THREE.MeshLambertMaterial({ color: 0xFFE4E1 }); // 浅粉色
        
        const leftEar = new THREE.Mesh(earGeometry, earMaterial);
        leftEar.position.set(-0.35, 2.4, 0);
        leftEar.rotation.z = Math.PI / 6;
        sheepHatGroup.add(leftEar);
        
        const rightEar = new THREE.Mesh(earGeometry, earMaterial);
        rightEar.position.set(0.35, 2.4, 0);
        rightEar.rotation.z = -Math.PI / 6;
        sheepHatGroup.add(rightEar);
        
        this.roleHats.sheep = sheepHatGroup;
        this.roleHats.sheep.visible = false;
        this.player.add(this.roleHats.sheep);

        // 狼的帽子（尖耳朵形状）
        const wolfHatGroup = new THREE.Group();
        
        // 狼耳朵（尖三角形）
        const wolfEarGeometry = new THREE.ConeGeometry(0.15, 0.5, 4);
        const wolfEarMaterial = new THREE.MeshLambertMaterial({ color: 0x2F4F4F }); // 深灰色
        
        const leftWolfEar = new THREE.Mesh(wolfEarGeometry, wolfEarMaterial);
        leftWolfEar.position.set(-0.25, 2.6, 0);
        leftWolfEar.rotation.z = -Math.PI / 8;
        wolfHatGroup.add(leftWolfEar);
        
        const rightWolfEar = new THREE.Mesh(wolfEarGeometry, wolfEarMaterial);
        rightWolfEar.position.set(0.25, 2.6, 0);
        rightWolfEar.rotation.z = Math.PI / 8;
        wolfHatGroup.add(rightWolfEar);
        
        // 狼眼睛（红色，表示凶狠）
        const eyeGeometry = new THREE.SphereGeometry(0.08, 8, 8);
        const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0xFF0000 }); // 红色眼睛
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.15, 2.3, 0.28);
        wolfHatGroup.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.15, 2.3, 0.28);
        wolfHatGroup.add(rightEye);
        
        // 狼鼻子
        const noseGeometry = new THREE.SphereGeometry(0.06, 8, 8);
        const noseMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 }); // 黑色鼻子
        const nose = new THREE.Mesh(noseGeometry, noseMaterial);
        nose.position.set(0, 2.2, 0.32);
        wolfHatGroup.add(nose);
        
        this.roleHats.wolf = wolfHatGroup;
        this.roleHats.wolf.visible = false;
        this.player.add(this.roleHats.wolf);

        // 设置当前角色
        this.setPlayerRole(this.playerRole);
    }

    setPlayerRole(role) {
        // 隐藏所有帽子
        if (this.roleHats.sheep) this.roleHats.sheep.visible = false;
        if (this.roleHats.wolf) this.roleHats.wolf.visible = false;

        // 显示对应角色的帽子
        if (this.roleHats[role]) {
            this.roleHats[role].visible = true;
            this.playerRole = role;

            // 更新角色颜色
            this.updatePlayerColors(role);

            // 更新UI指示器
            const roleIndicator = document.getElementById('roleIndicator');
            if (roleIndicator) {
                roleIndicator.textContent = role === 'sheep' ? '羊' : '狼';
                roleIndicator.style.color = role === 'sheep' ? '#4169E1' : '#DC143C';
            }
        }
    }

    updatePlayerColors(role) {
        if (!this.player || !this.player.children) return;
        
        const colors = this.playerColors[role];
        
        // 更新身体和手臂颜色
        this.player.children.forEach(child => {
            if (child.name === 'body') {
                child.material.color.set(colors.body);
            } else if (child.name === 'head') {
                child.material.color.set(colors.skin);
            }
        });
        
        // 更新手臂颜色（索引2和3）
        if (this.player.children[2]) {
            this.player.children[2].material.color.set(colors.body);
        }
        if (this.player.children[3]) {
            this.player.children[3].material.color.set(colors.body);
        }
        
        // 更新腿部颜色（索引4和5）
        if (this.player.children[4]) {
            this.player.children[4].material.color.set(colors.pants);
        }
        if (this.player.children[5]) {
            this.player.children[5].material.color.set(colors.pants);
        }
    }

    // 方法用于更改玩家颜色
    setPlayerColor(part, color) {
        if (!this.player || !this.player.children) return;

        this.playerColors[part] = color;

        // 更新相应的部分
        switch(part) {
            case 'body':
                this.updatePartColor(0, color); // 身体是第一个添加的子对象
                this.updatePartColor(2, color); // 左臂
                this.updatePartColor(3, color); // 右臂
                break;
            case 'pants':
                this.updatePartColor(4, color); // 左腿
                this.updatePartColor(5, color); // 右腿
                break;
            case 'skin':
                this.updatePartColor(1, color); // 头部
                break;
        }
    }

    updatePartColor(index, color) {
        if (this.player.children[index]) {
            this.player.children[index].material.color.set(color);
        }
    }

    // 新增：检查玩家与楼梯的交互
    checkStairInteraction() {
        if (!this.stairs) return;

        // 检查玩家是否接近楼梯
        for (const stair of this.stairs) {
            const distance = this.player.position.distanceTo(stair.object.position);

            if (distance < 2) { // 2单位内的交互距离
                // 处理楼层切换
                if (this.currentFloor < stair.destination.floor) {
                    // 上楼
                    this.goUpstairs(stair);
                } else if (this.currentFloor > stair.destination.floor) {
                    // 下楼
                    this.goDownstairs(stair);
                }
                break;
            }
        }
    }

    goUpstairs(stair) {
        // 将玩家传送到楼上
        this.currentFloor = stair.destination.floor;

        // 更新玩家位置到对应楼层高度
        const floorHeight = this.getFloorHeight(this.currentFloor);
        this.player.position.y = floorHeight;

        // 显示楼层切换提示
        this.showFloorChangeMessage(`已到达第${this.currentFloor}层`);
    }

    goDownstairs(stair) {
        // 将玩家传送到楼下
        this.currentFloor = Math.max(0, stair.destination.floor);

        // 更新玩家位置
        const floorHeight = this.getFloorHeight(this.currentFloor);
        this.player.position.y = floorHeight;

        // 显示楼层切换提示
        this.showFloorChangeMessage(`已到达第${this.currentFloor}层`);
    }

    getFloorHeight(floor) {
        // 根据楼层返回对应高度
        return floor * 3; // 每层大约3个单位高度
    }

    showFloorChangeMessage(message) {
        // 创建临时UI消息
        const messageDiv = document.createElement('div');
        messageDiv.textContent = message;
        messageDiv.style.position = 'absolute';
        messageDiv.style.top = '50%';
        messageDiv.style.left = '50%';
        messageDiv.style.transform = 'translate(-50%, -50%)';
        messageDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        messageDiv.style.color = 'white';
        messageDiv.style.padding = '10px 20px';
        messageDiv.style.borderRadius = '5px';
        messageDiv.style.fontSize = '18px';
        messageDiv.style.zIndex = '200';
        messageDiv.style.pointerEvents = 'none';

        document.getElementById('gameContainer').appendChild(messageDiv);

        // 3秒后移除消息
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 3000);
    }

    // 检查是否可以从天台跳下
    checkRoofJump() {
        // 如果玩家在天台且按下跳跃键（这里用鼠标点击右键模拟）
        if (this.currentFloor >= 2) { // 假设2层以上为天台区域
            // 检查玩家是否在某个建筑的屋顶附近
            for (const building of this.buildings) {
                if (building.floors && this.currentFloor >= building.floors) {
                    const distance = this.player.position.distanceTo(building.object.position);

                    // 如果玩家在建筑范围内且在足够高的位置
                    if (distance < building.size.x / 2 + 2 && this.player.position.y > building.size.y * 0.8) {
                        // 实现跳跃功能
                        this.jumpFromRoof();
                        break;
                    }
                }
            }
        }
    }

    jumpFromRoof() {
        // 从天台跳下
        this.currentFloor = 0; // 直接回到地面层
        this.player.position.y = 0; // 设置为地面高度

        // 显示跳下动画效果
        this.showJumpAnimation();
    }

    showJumpAnimation() {
        // 简单的视觉反馈
        console.log("Player jumped from roof!");
        this.showFloorChangeMessage("已从天台跳下！");
    }

    addLights() {
        // 环境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // 方向光
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(20, 30, 20);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
    }

    createGround() {
        // 创建地面
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x98FB98 }); // 马卡龙浅绿色
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2; // 旋转以使其水平
        ground.receiveShadow = true;
        this.scene.add(ground);

        // 添加格网，使场景更清晰
        const gridHelper = new THREE.GridHelper(100, 20, 0xC1E1A7, 0x90CDB0); // 配合马卡龙绿的格网
        this.scene.add(gridHelper);

        // 添加道路标记
        this.createRoads();

        // 添加花坛装饰
        this.createFlowerbeds();

        // 添加树木
        this.createTrees();

        // 添加建筑
        this.createBuildings();

        // 创建操场设施
        this.createPlaygroundEquipment();

        // 创建长椅
        this.createBenches();

        // 创建路灯
        this.createStreetlights();

        // 创建椅子（用于捆绑羊）
        this.createChairs();

        // 创建测试NPC（用于钩子测试）
        this.createTestNPC();
        
        // 初始化道具系统
        this.initItemSystem();
    }

    initItemSystem() {
        // 初始化道具数组
        this.items = [];
        
        // 每30秒刷新一次道具
        this.itemSpawnInterval = setInterval(() => {
            this.spawnItems();
        }, 30000);
        
        // 初始生成一批道具
        this.spawnItems();
    }

    spawnItems() {
        // 最多同时存在6个道具
        if (this.items.length >= 6) return;

        // 道具类型
        const itemTypes = ['speedBoost', 'extraLife', 'invisibility', 'purification'];
        
        // 随机生成1-3个道具
        const numItems = Math.floor(Math.random() * 3) + 1;
        
        for (let i = 0; i < numItems; i++) {
            if (this.items.length >= 6) break;
            
            // 随机选择道具类型
            const itemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
            
            // 随机位置（在地图范围内，避开建筑物）
            let position;
            let validPosition = false;
            let attempts = 0;
            
            while (!validPosition && attempts < 20) {
                position = new THREE.Vector3(
                    (Math.random() - 0.5) * 70, // -35 到 35
                    0.5,
                    (Math.random() - 0.5) * 70
                );
                
                // 检查是否与建筑物碰撞
                validPosition = !this.checkItemCollision(position);
                attempts++;
            }
            
            if (validPosition) {
                this.createItem(itemType, position);
            }
        }
    }

    checkItemCollision(position) {
        // 检查道具是否与建筑物或其他道具重叠
        if (this.buildings) {
            for (const building of this.buildings) {
                const distance = position.distanceTo(building.object.position);
                if (distance < 10) return true;
            }
        }
        
        // 检查与其他道具的距离
        for (const item of this.items) {
            const distance = position.distanceTo(item.position);
            if (distance < 3) return true;
        }
        
        return false;
    }

    createItem(type, position) {
        const itemGroup = new THREE.Group();
        
        // 根据类型创建不同的道具外观
        let geometry, material, icon;
        
        switch(type) {
            case 'speedBoost':
                geometry = new THREE.ConeGeometry(0.3, 0.6, 8);
                material = new THREE.MeshLambertMaterial({ color: 0x00FF00, emissive: 0x00FF00, emissiveIntensity: 0.3 });
                icon = '🏃';
                break;
            case 'extraLife':
                geometry = new THREE.SphereGeometry(0.3, 16, 16);
                material = new THREE.MeshLambertMaterial({ color: 0xFF0000, emissive: 0xFF0000, emissiveIntensity: 0.3 });
                icon = '❤️';
                break;
            case 'invisibility':
                geometry = new THREE.TorusGeometry(0.3, 0.1, 8, 16);
                material = new THREE.MeshLambertMaterial({ color: 0x9370DB, emissive: 0x9370DB, emissiveIntensity: 0.3, transparent: true, opacity: 0.7 });
                icon = '👻';
                break;
            case 'purification':
                geometry = new THREE.OctahedronGeometry(0.4);
                material = new THREE.MeshLambertMaterial({ color: 0xFFD700, emissive: 0xFFD700, emissiveIntensity: 0.3 });
                icon = '✨';
                break;
        }
        
        const item = new THREE.Mesh(geometry, material);
        item.position.y = 0.5;
        itemGroup.add(item);
        
        // 添加光晕效果
        const glowGeometry = new THREE.SphereGeometry(0.6, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({ 
            color: material.color, 
            transparent: true, 
            opacity: 0.2 
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.y = 0.5;
        itemGroup.add(glow);
        
        // 设置位置
        itemGroup.position.copy(position);
        
        // 存储道具信息
        itemGroup.itemType = type;
        itemGroup.icon = icon;
        itemGroup.spawnTime = Date.now();
        
        // 添加旋转动画
        itemGroup.userData.rotationSpeed = 0.02;
        
        this.scene.add(itemGroup);
        this.items.push(itemGroup);
    }

    createRoads() {
        // 创建校园道路
        const roadPositions = [
            { x: 0, z: 0, width: 4, length: 100 }, // 主干道
            { x: 0, z: 0, width: 100, length: 4 }, // 横向道路
            { x: -15, z: 10, width: 3, length: 20 }, // 小径
            { x: 15, z: -10, width: 3, length: 20 }  // 小径
        ];

        roadPositions.forEach(road => {
            const roadGeometry = new THREE.PlaneGeometry(road.width, road.length);
            const roadMaterial = new THREE.MeshLambertMaterial({ color: 0xD2B48C }); // 浅土黄
            const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
            roadMesh.rotation.x = -Math.PI / 2;
            roadMesh.position.set(road.x, 0.01, road.z); // 稍微高于地面防止z-fighting
            this.scene.add(roadMesh);

            // 添加道路标线（如果是主干道）
            if (road.width >= 4) {
                this.addRoadLines(roadMesh, road.width, road.length);
            }
        });
    }

    addRoadLines(roadMesh, width, length) {
        // 添加道路中心线
        const lineGeometry = new THREE.PlaneGeometry(0.2, length);
        const lineMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFFF }); // 白色标线
        const centerLine = new THREE.Mesh(lineGeometry, lineMaterial);
        centerLine.rotation.x = -Math.PI / 2;
        centerLine.position.set(0, 0.02, 0); // 稍高于道路表面
        roadMesh.add(centerLine);
    }

    createFlowerbeds() {
        // 创建圆形花坛
        const flowerbedPositions = [
            { x: -25, z: -25, radius: 3 },
            { x: 25, z: -25, radius: 2.5 },
            { x: 25, z: 25, radius: 3.5 },
            { x: -25, z: 25, radius: 2 }
        ];

        flowerbedPositions.forEach(pos => {
            const flowerbedGeometry = new THREE.CylinderGeometry(pos.radius, pos.radius, 0.5, 16);
            const flowerbedMaterial = new THREE.MeshLambertMaterial({ color: 0xFFB6C1 }); // 浅粉色花坛
            const flowerbed = new THREE.Mesh(flowerbedGeometry, flowerbedMaterial);
            flowerbed.position.set(pos.x, 0.25, pos.z);
            flowerbed.rotation.x = Math.PI / 2;
            this.scene.add(flowerbed);

            // 添加花朵
            this.addFlowersToFlowerbed(flowerbed, pos.radius);
        });
    }

    addFlowersToFlowerbed(flowerbed, radius) {
        // 在花坛中随机放置花朵
        const flowerCount = Math.floor(radius * 3); // 根据花坛大小决定花朵数量

        for (let i = 0; i < flowerCount; i++) {
            const angle = (i / flowerCount) * Math.PI * 2;
            const distance = Math.random() * (radius - 0.5); // 随机距离中心的距离

            // 花茎
            const stemGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8);
            const stemMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 }); // 茎绿色
            const stem = new THREE.Mesh(stemGeometry, stemMaterial);
            stem.position.set(
                Math.cos(angle) * distance,
                0.65, // 在花坛上方
                Math.sin(angle) * distance
            );
            flowerbed.add(stem);

            // 花朵顶部
            const petalGeometry = new THREE.SphereGeometry(0.2, 8, 8);
            const colors = [0xFF69B4, 0xFF1493, 0xFF6347, 0xFFD700]; // 不同颜色的花瓣
            const petalMaterial = new THREE.MeshLambertMaterial({ color: colors[Math.floor(Math.random() * colors.length)] });
            const petal = new THREE.Mesh(petalGeometry, petalMaterial);
            petal.position.set(0, 1.0, 0);
            stem.add(petal);
        }
    }

    createPlaygroundEquipment() {
        // 创建操场设备
        const equipmentData = [
            { type: 'basketball_hoop', x: -35, z: 35 },
            { type: 'slide', x: 35, z: -35 },
            { type: 'swing', x: -35, z: -35 }
        ];

        equipmentData.forEach(item => {
            const equipmentGroup = new THREE.Group();

            switch(item.type) {
                case 'basketball_hoop':
                    this.createBasketballHoop(equipmentGroup);
                    break;
                case 'slide':
                    this.createSlide(equipmentGroup);
                    break;
                case 'swing':
                    this.createSwing(equipmentGroup);
                    break;
            }

            equipmentGroup.position.set(item.x, 0, item.z);
            equipmentGroup.castShadow = true;
            this.scene.add(equipmentGroup);
        });
    }

    createBasketballHoop(group) {
        // 篮球场地面
        const courtGeometry = new THREE.PlaneGeometry(6, 6);
        const courtMaterial = new THREE.MeshLambertMaterial({ color: 0xFFA500 }); // 橙色
        const court = new THREE.Mesh(courtGeometry, courtMaterial);
        court.rotation.x = -Math.PI / 2;
        court.position.y = 0.01; // 稍微高于地面
        group.add(court);

        // 篮板
        const backboardGeometry = new THREE.BoxGeometry(1.8, 1.2, 0.1);
        const backboardMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
        const backboard = new THREE.Mesh(backboardGeometry, backboardMaterial);
        backboard.position.set(0, 3, -2.8);
        group.add(backboard);

        // 篮筐
        const rimGeometry = new THREE.TorusGeometry(0.45, 0.05, 16, 32);
        const rimMaterial = new THREE.MeshLambertMaterial({ color: 0xFF0000 });
        const rim = new THREE.Mesh(rimGeometry, rimMaterial);
        rim.position.set(0, 3, -3.2);
        rim.rotation.x = Math.PI / 2;
        group.add(rim);
    }

    createSlide(group) {
        // 滑梯基座
        const baseGeometry = new THREE.BoxGeometry(2, 0.5, 2);
        const baseMaterial = new THREE.MeshLambertMaterial({ color: 0x4682B4 }); // 钢蓝色
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.set(0, 0.25, 0);
        group.add(base);

        // 滑梯面（弯曲的）
        const slideGeometry = new THREE.CylinderGeometry(0.6, 0.6, 4, 8, 1, true);
        const slideMaterial = new THREE.MeshLambertMaterial({ color: 0xFF4500 }); // 橙红色
        const slide = new THREE.Mesh(slideGeometry, slideMaterial);
        slide.position.set(0, 2, -2);
        slide.rotation.x = Math.PI / 2;
        slide.rotation.z = Math.PI / 4; // 弯曲效果
        group.add(slide);

        // 扶手
        const railGeometry = new THREE.CylinderGeometry(0.05, 0.05, 4, 8);
        const railMaterial = new THREE.MeshLambertMaterial({ color: 0x2F4F4F }); // 深灰

        const leftRail = new THREE.Mesh(railGeometry, railMaterial);
        leftRail.position.set(0.65, 2, -2);
        leftRail.rotation.x = Math.PI / 2;
        leftRail.rotation.z = Math.PI / 4;
        group.add(leftRail);

        const rightRail = new THREE.Mesh(railGeometry, railMaterial);
        rightRail.position.set(-0.65, 2, -2);
        rightRail.rotation.x = Math.PI / 2;
        rightRail.rotation.z = Math.PI / 4;
        group.add(rightRail);
    }

    createSwing(group) {
        // 秋千架
        const frameGeometry = new THREE.BoxGeometry(0.2, 3, 4);
        const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // 棕色
        const frame = new THREE.Mesh(frameGeometry, frameMaterial);
        frame.position.set(0, 1.5, 0);
        group.add(frame);

        // 秋千座位
        const seatGeometry = new THREE.BoxGeometry(1.5, 0.1, 0.1);
        const seatMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 }); // 绿色
        const seat = new THREE.Mesh(seatGeometry, seatMaterial);
        seat.position.set(0, 1, -1.5);
        group.add(seat);

        // 秋千绳索
        const ropeGeometry = new THREE.CylinderGeometry(0.02, 0.02, 1.8, 8);
        const ropeMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 }); // 深棕色

        const leftRope = new THREE.Mesh(ropeGeometry, ropeMaterial);
        leftRope.position.set(0.6, 2.1, -1.5);
        leftRope.rotation.z = Math.PI / 8;
        group.add(leftRope);

        const rightRope = new THREE.Mesh(ropeGeometry, ropeMaterial);
        rightRope.position.set(-0.6, 2.1, -1.5);
        rightRope.rotation.z = -Math.PI / 8;
        group.add(rightRope);
    }

    createBenches() {
        // 创建长椅
        const benchPositions = [
            { x: -10, z: -30, rotation: 0 },
            { x: 10, z: 30, rotation: Math.PI },
            { x: -30, z: 10, rotation: Math.PI/2 },
            { x: 30, z: -10, rotation: -Math.PI/2 }
        ];

        benchPositions.forEach(pos => {
            const benchGroup = new THREE.Group();
            benchGroup.position.set(pos.x, 0, pos.z);
            benchGroup.rotation.y = pos.rotation;

            // 长椅座面
            const seatGeometry = new THREE.BoxGeometry(3, 0.1, 0.8);
            const seatMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // 棕色
            const seat = new THREE.Mesh(seatGeometry, seatMaterial);
            seat.position.y = 0.6; // 离地面一定高度
            benchGroup.add(seat);

            // 靠背
            const backGeometry = new THREE.BoxGeometry(3, 0.8, 0.1);
            const back = new THREE.Mesh(backGeometry, seatMaterial);
            back.position.set(0, 1.0, -0.35); // 靠近玩家的一侧
            benchGroup.add(back);

            // 支撑腿（4条）
            const legHeight = 0.6;
            const legGeometry = new THREE.CylinderGeometry(0.1, 0.1, legHeight, 8);

            // 左前腿
            const leg1 = new THREE.Mesh(legGeometry, seatMaterial);
            leg1.position.set(1.2, legHeight/2, 0.35);
            benchGroup.add(leg1);

            // 右前腿
            const leg2 = new THREE.Mesh(legGeometry, seatMaterial);
            leg2.position.set(-1.2, legHeight/2, 0.35);
            benchGroup.add(leg2);

            // 左后腿
            const leg3 = new THREE.Mesh(legGeometry, seatMaterial);
            leg3.position.set(1.2, legHeight/2, -0.35);
            benchGroup.add(leg3);

            // 右后腿
            const leg4 = new THREE.Mesh(legGeometry, seatMaterial);
            leg4.position.set(-1.2, legHeight/2, -0.35);
            benchGroup.add(leg4);

            benchGroup.castShadow = true;
            this.scene.add(benchGroup);
        });
    }

    createStreetlights() {
        // 创建路灯
        const lightPositions = [
            { x: -30, z: 0 },
            { x: 30, z: 0 },
            { x: 0, z: -30 },
            { x: 0, z: 30 }
        ];

        lightPositions.forEach(pos => {
            const lightGroup = new THREE.Group();
            lightGroup.position.set(pos.x, 0, pos.z);

            // 灯柱
            const poleGeometry = new THREE.CylinderGeometry(0.1, 0.15, 5, 8);
            const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x708090 }); // 石板灰
            const pole = new THREE.Mesh(poleGeometry, poleMaterial);
            pole.position.y = 2.5;
            lightGroup.add(pole);

            // 灯罩
            const lampGeometry = new THREE.SphereGeometry(0.5, 16, 16);
            const lampMaterial = new THREE.MeshLambertMaterial({ color: 0xF5DEB3 }); // 麦色
            const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
            lamp.position.set(0, 5, 0);
            lightGroup.add(lamp);

            // 添加灯光效果
            const spotLight = new THREE.SpotLight(0xFFFACD, 0.5, 10, Math.PI / 4, 0.5, 1);
            spotLight.position.set(0, 5, 0);
            spotLight.castShadow = true;
            lightGroup.add(spotLight);

            this.scene.add(lightGroup);
        });
    }

    createTestNPC() {
        // 创建一个测试NPC（羊）用于钩子测试
        const npc = new THREE.Group();

        // 身体
        const bodyGeometry = new THREE.BoxGeometry(0.8, 1.2, 0.4);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xFFA500 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 1.5;
        body.castShadow = true;
        npc.add(body);

        // 头部
        const headGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFFCC99 });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 2.2;
        head.castShadow = true;
        npc.add(head);

        // 左臂、右臂、左腿、右腿
        const armGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
        const armMaterial = new THREE.MeshLambertMaterial({ color: 0xFFA500 });

        const leftArm = new THREE.Mesh(armGeometry, armMaterial);
        leftArm.position.set(-0.55, 1.6, 0);
        leftArm.castShadow = true;
        npc.add(leftArm);

        const rightArm = new THREE.Mesh(armGeometry, armMaterial);
        rightArm.position.set(0.55, 1.6, 0);
        rightArm.castShadow = true;
        npc.add(rightArm);

        const legGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
        const legMaterial = new THREE.MeshLambertMaterial({ color: 0x0000FF });

        const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
        leftLeg.position.set(-0.25, 0.5, 0);
        leftLeg.castShadow = true;
        npc.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
        rightLeg.position.set(0.25, 0.5, 0);
        rightLeg.castShadow = true;
        npc.add(rightLeg);

        // 羊的帽子
        const hatGeometry = new THREE.SphereGeometry(0.4, 16, 16);
        const hatMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
        const hat = new THREE.Mesh(hatGeometry, hatMaterial);
        hat.position.set(0, 2.6, 0);
        npc.add(hat);

        // 设置NPC位置
        npc.position.set(5, 0, 5);
        npc.name = 'test_npc';

        // 添加状态属性
        npc.isBound = false;
        npc.boundToChair = null;

        this.scene.add(npc);

        // 保存NPC引用
        this.testNPC = npc;
    }

    createChairs() {
        // 在场景中创建几把椅子
        const chairPositions = [
            { x: 8, z: 8 },
            { x: -8, z: 8 },
            { x: 8, z: -8 },
            { x: -8, z: -8 }
        ];

        this.chairs = [];

        chairPositions.forEach((pos, index) => {
            const chairGroup = new THREE.Group();
            chairGroup.position.set(pos.x, 0, pos.z);

            // 椅子座面
            const seatGeometry = new THREE.BoxGeometry(1.2, 0.1, 1.0);
            const seatMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // 棕色
            const seat = new THREE.Mesh(seatGeometry, seatMaterial);
            seat.position.y = 0.5; // 离地面一定高度
            seat.castShadow = true;
            chairGroup.add(seat);

            // 椅背
            const backGeometry = new THREE.BoxGeometry(0.1, 1.0, 0.8);
            const back = new THREE.Mesh(backGeometry, seatMaterial);
            back.position.set(0, 1.0, -0.3); // 靠近玩家的一侧
            back.castShadow = true;
            chairGroup.add(back);

            // 椅腿（4条）
            const legHeight = 0.5;
            const legGeometry = new THREE.CylinderGeometry(0.1, 0.1, legHeight, 8);

            // 左前腿
            const leg1 = new THREE.Mesh(legGeometry, seatMaterial);
            leg1.position.set(0.5, legHeight/2, 0.4);
            leg1.castShadow = true;
            chairGroup.add(leg1);

            // 右前腿
            const leg2 = new THREE.Mesh(legGeometry, seatMaterial);
            leg2.position.set(-0.5, legHeight/2, 0.4);
            leg2.castShadow = true;
            chairGroup.add(leg2);

            // 左后腿
            const leg3 = new THREE.Mesh(legGeometry, seatMaterial);
            leg3.position.set(0.5, legHeight/2, -0.4);
            leg3.castShadow = true;
            chairGroup.add(leg3);

            // 右后腿
            const leg4 = new THREE.Mesh(legGeometry, seatMaterial);
            leg4.position.set(-0.5, legHeight/2, -0.4);
            leg4.castShadow = true;
            chairGroup.add(leg4);

            chairGroup.name = `chair_${index}`;
            this.scene.add(chairGroup);

            // 保存椅子引用
            this.chairs.push({
                object: chairGroup,
                occupied: false,
                occupant: null
            });
        });
    }

    bindJoystickEvents() {
        // 左摇杆事件处理（移动）
        this.leftJoystick.on('move', (evt, data) => {
            this.moveVector.x = data.vector.x;
            this.moveVector.z = -data.vector.y; // 注意y轴方向反转

            // 根据摇杆输入移动玩家
            // 狼人在躲藏阶段无法移动
            if (this.gameState === 'hiding' && this.playerRole === 'wolf') {
                return;
            }
            
            // 被捆绑的玩家无法移动
            if (this.isBound) {
                return;
            }
            
            // 检查游戏状态（hiding或playing时可以移动）
            if (this.gameState !== 'hiding' && this.gameState !== 'playing') {
                return;
            }
            
            // 检查是否有移动输入
            if (this.moveVector.x === 0 && this.moveVector.z === 0) {
                return;
            }

            // 计算移动速度（考虑加速技能）
            let speed = 0.2;
            if (this.speedBoost.active || this.activeItems.speedBoost) {
                speed *= this.speedBoost.multiplier;
            }

            // 计算新位置
            const newX = this.player.position.x + this.moveVector.x * speed;
            const newZ = this.player.position.z + this.moveVector.z * speed;

            // 检查碰撞
            if (this.checkCollision(newX, newZ)) {
                // 如果发生碰撞，则不移动
                return;
            }

            // 移动玩家
            this.player.position.x = newX;
            this.player.position.z = newZ;

            // 让角色朝向移动方向
            const angle = Math.atan2(this.moveVector.x, this.moveVector.z);
            this.player.rotation.y = angle;

            // 更新相机跟随位置
            this.updateCamera();
        });

        // 左摇杆结束事件
        this.leftJoystick.on('end', (evt) => {
            if (this.gameState !== 'hiding' && this.player.isBound !== true) {
                this.moveVector.set(0, 0, 0); // 停止移动
            }
        });

        // 右摇杆事件处理（钩子功能）
        this.rightJoystick.on('move', (evt, data) => {
            if (this.gameState !== 'playing') return;

            // 只有狼才能使用钩子
            if (this.playerRole !== 'wolf') return;

            this.hookSystem.aiming = true;
            this.hookSystem.aimingVector = new THREE.Vector3(data.vector.x, 0, -data.vector.y);

            // 绘制瞄准线
            this.drawAimingLine();
        });

        // 右摇杆结束事件（发射钩子）
        this.rightJoystick.on('end', (evt) => {
            if (this.gameState !== 'playing') return;

            // 只有狼才能使用钩子
            if (this.playerRole !== 'wolf') return;

            this.hookSystem.aiming = false;
            this.clearAimingLine();

            // 发射钩子
            if (this.hookSystem.aimingVector) {
                this.shootHook();
            }
        });
    }

    checkCollision(x, z) {
        // 检查是否与建筑物碰撞
        if (this.buildings) {
            for (const building of this.buildings) {
                // 获取建筑的边界框
                const bbox = building.boundingBox;

                // 简化碰撞检测，检查玩家周围的区域
                const playerRadius = 0.5; // 玩家半径

                // 创建玩家可能占据的空间边界框
                const playerBox = new THREE.Box3(
                    new THREE.Vector3(x - playerRadius, 0, z - playerRadius),
                    new THREE.Vector3(x + playerRadius, 3, z + playerRadius)
                );

                // 检查边界框是否相交
                if (bbox.intersectsBox(playerBox)) {
                    return true; // 发生碰撞
                }
            }
        }

        // 检查边界（地图边缘）
        const mapBoundary = 40;
        if (Math.abs(x) > mapBoundary || Math.abs(z) > mapBoundary) {
            return true;
        }

        // 没有碰撞
        return false;
    }

    handleHookHit(target) {
        // 处理钩子命中的逻辑
        if (!target) return;
        
        // 检查目标是否是羊且未被捆绑
        if (target.role === 'sheep' && !target.isBound) {
            console.log("Hook hit a sheep! Starting drag mechanism...");
            
            // 将羊拉到狼面前
            this.pullToWolf(target);
            
            // 启动拖拽机制（3秒内需要拖到椅子）
            this.startDragMechanism(target);
        }
    }

    pullToWolf(target) {
        // 将目标拉到狼面前
        const pullDistance = 2; // 拉到面前2米处
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.player.quaternion);
        
        target.position.copy(this.player.position);
        target.position.add(direction.multiplyScalar(pullDistance));
        target.position.y = 0;
        
        // 播放拉扯效果
        this.playSound('hook_hit');
        this.showNotification('抓住了一只羊！快拖到椅子！');
    }

    startDragMechanism(target) {
        // 3秒拖拽倒计时
        this.dragMechanism = {
            active: true,
            target: target,
            timeLeft: 3,
            interval: null
        };
        
        // 显示拖拽UI
        this.showDragUI();
        
        // 启动倒计时
        this.dragMechanism.interval = setInterval(() => {
            this.dragMechanism.timeLeft -= 0.1;
            this.updateDragUI();
            
            // 检查是否靠近椅子
            const nearestChair = this.findNearestFreeChair(target.position);
            if (nearestChair) {
                const distance = target.position.distanceTo(nearestChair.object.position);
                if (distance < 2) {
                    // 自动吸附到椅子
                    this.bindToChair(target, nearestChair);
                    this.endDragMechanism();
                    return;
                }
            }
            
            // 时间到，羊逃脱
            if (this.dragMechanism.timeLeft <= 0) {
                this.showNotification('羊逃脱了！');
                this.endDragMechanism();
            }
        }, 100);
    }

    showDragUI() {
        // 创建拖拽提示UI
        let dragUI = document.getElementById('dragUI');
        if (!dragUI) {
            dragUI = document.createElement('div');
            dragUI.id = 'dragUI';
            dragUI.style.position = 'absolute';
            dragUI.style.top = '50%';
            dragUI.style.left = '50%';
            dragUI.style.transform = 'translate(-50%, -50%)';
            dragUI.style.backgroundColor = 'rgba(220, 20, 60, 0.9)';
            dragUI.style.color = 'white';
            dragUI.style.padding = '20px 40px';
            dragUI.style.borderRadius = '10px';
            dragUI.style.fontSize = '24px';
            dragUI.style.fontWeight = 'bold';
            dragUI.style.zIndex = '250';
            document.getElementById('gameContainer').appendChild(dragUI);
        }
        dragUI.style.display = 'block';
    }

    updateDragUI() {
        const dragUI = document.getElementById('dragUI');
        if (dragUI && this.dragMechanism) {
            dragUI.innerHTML = `
                <div>拖到椅子！</div>
                <div style="font-size: 32px; margin-top: 10px;">
                    ${this.dragMechanism.timeLeft.toFixed(1)}s
                </div>
            `;
        }
    }

    endDragMechanism() {
        if (this.dragMechanism) {
            clearInterval(this.dragMechanism.interval);
            this.dragMechanism.active = false;
        }
        
        const dragUI = document.getElementById('dragUI');
        if (dragUI) {
            dragUI.style.display = 'none';
        }
    }

    findNearestFreeChair(position) {
        if (!this.chairs) return null;

        let nearestChair = null;
        let minDistance = Infinity;

        for (const chair of this.chairs) {
            if (!chair.occupied) {
                const distance = position.distanceTo(chair.object.position);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestChair = chair;
                }
            }
        }

        return nearestChair;
    }

    bindToChair(npc, chair) {
        // 将NPC绑定到椅子上
        npc.isBound = true;
        npc.boundToChair = chair.object;

        // 占用椅子
        chair.occupied = true;
        chair.occupant = npc;

        // 将NPC移到椅子位置
        npc.position.copy(chair.object.position);
        npc.position.y = 0.6; // 调整到座椅高度

        // 改变NPC颜色表示被捆绑
        npc.children[0].material.color.set(0x800080); // 紫色表示被捆绑

        console.log(`NPC bound to chair at (${chair.object.position.x}, ${chair.object.position.z})`);

        // 播放捆绑音效
        this.playSound('bind');

        // 显示捆绑成功提示
        this.showFloorChangeMessage("成功抓住了一只羊！");

        // 检查胜利条件
        this.checkWinCondition();
    }

    createTrees() {
        // 定义一些树木的位置
        const treePositions = [
            { x: -30, z: -20 }, { x: 25, z: -15 }, { x: 30, z: 10 },
            { x: -35, z: 25 }, { x: -5, z: 30 }, { x: 15, z: -30 },
            { x: 0, z: 25 }, { x: -20, z: 15 }
        ];

        treePositions.forEach(pos => {
            const treeGroup = new THREE.Group();

            // 圆润的树干（更粗更短，符合Q版风格）
            const trunkGeometry = new THREE.CylinderGeometry(0.4, 0.6, 2, 8);
            const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // 棕色
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.set(0, 1, 0);
            trunk.castShadow = true;
            treeGroup.add(trunk);

            // 更圆润的树冠（多个球体组合形成蓬松效果）
            const createTreeTop = (offsetX = 0, offsetZ = 0) => {
                const crownGeometry = new THREE.SphereGeometry(2.5, 12, 12);
                const crownMaterial = new THREE.MeshLambertMaterial({ color: 0x32CD32 }); // 酸橙绿
                const crown = new THREE.Mesh(crownGeometry, crownMaterial);
                crown.position.set(offsetX, 3.5, offsetZ);
                crown.castShadow = true;
                return crown;
            };

            // 中心主树冠
            treeGroup.add(createTreeTop());

            // 周围小树冠增加蓬松感
            treeGroup.add(createTreeTop(1, 0.5));
            treeGroup.add(createTreeTop(-1, -0.5));
            treeGroup.add(createTreeTop(0.5, -1));
            treeGroup.add(createTreeTop(-0.5, 1));

            treeGroup.position.set(pos.x, 0, pos.z);
            treeGroup.castShadow = true;
            treeGroup.receiveShadow = true;
            this.scene.add(treeGroup);
        });
    }

    createBuildings() {
        // 校园场景中的建筑
        const buildingData = [
            // 教学楼 (两层，含天台)
            {
                pos: { x: -20, z: 0 },
                size: { x: 15, y: 8, z: 12 },
                floors: 2,
                name: 'mainBuilding',
                color: 0xFFD700  // 金黄色 - 主要建筑
            },
            // 图书馆
            {
                pos: { x: 15, z: -15 },
                size: { x: 12, y: 6, z: 10 },
                floors: 1,
                name: 'library',
                color: 0x87CEEB  // 天蓝色
            },
            // 宿舍楼
            {
                pos: { x: 20, z: 15 },
                size: { x: 10, y: 5, z: 15 },
                floors: 1,
                name: 'dormitory',
                color: 0xFFB6C1  // 浅粉红
            },
            // 食堂
            {
                pos: { x: -15, z: 20 },
                size: { x: 8, y: 4, z: 12 },
                floors: 1,
                name: 'cafeteria',
                color: 0x98FB98  // 浅绿色
            }
        ];

        this.buildings = []; // 存储建筑信息用于碰撞检测

        buildingData.forEach(data => {
            // 创建多层建筑
            const buildingGroup = new THREE.Group();
            buildingGroup.userData = {
                name: data.name,
                floors: data.floors,
                position: data.pos,
                size: data.size
            };

            // 每层的高度
            const floorHeight = data.size.y / data.floors;

            for (let i = 0; i < data.floors; i++) {
                // 圆角矩形的近似实现
                const floorGeometry = new THREE.BoxGeometry(data.size.x, floorHeight, data.size.z);

                // 使用马卡龙色调
                const floorMaterial = new THREE.MeshLambertMaterial({
                    color: data.color,
                    transparent: true,
                    opacity: 0.9
                });

                const floor = new THREE.Mesh(floorGeometry, floorMaterial);
                floor.position.y = floorHeight * (i + 0.5); // 每层的中心高度

                // 添加窗户装饰
                this.addWindows(floor, data.size.x, floorHeight, data.size.z, data.color);

                buildingGroup.add(floor);
            }

            // 屋顶
            const roofGeometry = new THREE.CylinderGeometry(
                data.size.x * 0.6,
                data.size.x * 0.6,
                1,
                8
            ); // 圆角屋顶
            const roofMaterial = new THREE.MeshLambertMaterial({ color: 0xFF6347 }); // 番茄红
            const roof = new THREE.Mesh(roofGeometry, roofMaterial);
            roof.position.y = data.size.y + 0.5;
            roof.rotation.x = Math.PI / 2; // 水平放置
            buildingGroup.add(roof);

            buildingGroup.position.set(data.pos.x, 0, data.pos.z);
            buildingGroup.castShadow = true;
            buildingGroup.receiveShadow = true;

            this.scene.add(buildingGroup);

            // 保存建筑信息用于碰撞检测
            this.buildings.push({
                object: buildingGroup,
                boundingBox: new THREE.Box3().setFromObject(buildingGroup),
                name: data.name,
                floors: data.floors
            });
        });

        // 添加楼梯连接不同楼层
        this.createStairs();
        
        // 创建门系统
        this.createDoors();
    }

    createDoors() {
        // 在建筑物上创建门
        const doorData = [
            // 教学楼正门
            { x: -20, y: 0, z: -6, rotation: 0, interactive: true, name: 'main_entrance' },
            // 教学楼侧门
            { x: -27, y: 0, z: 0, rotation: Math.PI/2, interactive: true, name: 'main_side' },
            // 图书馆门
            { x: 15, y: 0, z: -20, rotation: 0, interactive: true, name: 'library_entrance' },
            // 宿舍楼门
            { x: 25, y: 0, z: 15, rotation: -Math.PI/2, interactive: true, name: 'dorm_entrance' },
            // 食堂门
            { x: -15, y: 0, z: 26, rotation: 0, interactive: true, name: 'cafeteria_entrance' },
            // 不可开启的门（装饰用）
            { x: -13, y: 0, z: 20, rotation: Math.PI, interactive: false, name: 'cafeteria_back' }
        ];

        this.doors = [];

        doorData.forEach(data => {
            const doorGroup = new THREE.Group();
            
            // 门框
            const frameGeometry = new THREE.BoxGeometry(2, 3, 0.2);
            const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // 棕色门框
            const frame = new THREE.Mesh(frameGeometry, frameMaterial);
            frame.position.y = 1.5;
            doorGroup.add(frame);

            // 门板（两扇）
            const doorGeometry = new THREE.BoxGeometry(0.9, 2.8, 0.1);
            const doorMaterial = new THREE.MeshLambertMaterial({ 
                color: data.interactive ? 0xA0522D : 0x696969 // 可交互：棕褐色，不可交互：灰色
            });

            // 左门
            const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
            leftDoor.position.set(-0.45, 1.4, 0.05);
            leftDoor.name = 'leftDoor';
            doorGroup.add(leftDoor);

            // 右门
            const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
            rightDoor.position.set(0.45, 1.4, 0.05);
            rightDoor.name = 'rightDoor';
            doorGroup.add(rightDoor);

            // 门把手
            const handleGeometry = new THREE.SphereGeometry(0.08, 8, 8);
            const handleMaterial = new THREE.MeshLambertMaterial({ color: 0xFFD700 }); // 金色把手

            const leftHandle = new THREE.Mesh(handleGeometry, handleMaterial);
            leftHandle.position.set(-0.1, 1.4, 0.15);
            doorGroup.add(leftHandle);

            const rightHandle = new THREE.Mesh(handleGeometry, handleMaterial);
            rightHandle.position.set(0.1, 1.4, 0.15);
            doorGroup.add(rightHandle);

            // 设置门的位置和旋转
            doorGroup.position.set(data.x, data.y, data.z);
            doorGroup.rotation.y = data.rotation;

            // 存储门的状态
            doorGroup.userData = {
                name: data.name,
                interactive: data.interactive,
                isOpen: false,
                leftDoor: leftDoor,
                rightDoor: rightDoor
            };

            doorGroup.castShadow = true;
            this.scene.add(doorGroup);

            this.doors.push(doorGroup);
        });
    }

    toggleDoor(door) {
        if (!door || !door.userData.interactive) return;

        const isOpen = door.userData.isOpen;
        const leftDoor = door.userData.leftDoor;
        const rightDoor = door.userData.rightDoor;

        if (isOpen) {
            // 关门动画
            leftDoor.rotation.y = 0;
            rightDoor.rotation.y = 0;
            leftDoor.position.set(-0.45, 1.4, 0.05);
            rightDoor.position.set(0.45, 1.4, 0.05);
            door.userData.isOpen = false;
        } else {
            // 开门动画（门向外开）
            leftDoor.rotation.y = -Math.PI / 2;
            rightDoor.rotation.y = Math.PI / 2;
            leftDoor.position.set(-0.45, 1.4, -0.45);
            rightDoor.position.set(0.45, 1.4, 0.45);
            door.userData.isOpen = true;
        }

        this.playSound('door');
    }

    addWindows(floor, width, height, depth, baseColor) {
        // 添加窗户效果，使建筑更生动
        const windowSize = 0.8;
        const windowMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFE0 }); // 米黄色窗户

        // 计算窗户数量
        const windowsPerSide = Math.floor(Math.max(width, depth) / 3);

        // 前后两侧窗户
        for (let i = 0; i < windowsPerSide; i++) {
            if (i % 2 === 0) { // 交错排列窗户
                // 前面
                const windowFront = new THREE.Mesh(
                    new THREE.BoxGeometry(windowSize, windowSize * 0.6, 0.1),
                    windowMaterial
                );
                windowFront.position.set(
                    (width / 2 - 1.5) - i * (width / windowsPerSide),
                    floor.position.y - height / 4,
                    depth / 2 - 0.05
                );
                this.scene.add(windowFront);

                // 后面
                const windowBack = new THREE.Mesh(
                    new THREE.BoxGeometry(windowSize, windowSize * 0.6, 0.1),
                    windowMaterial
                );
                windowBack.position.set(
                    (width / 2 - 1.5) - i * (width / windowsPerSide),
                    floor.position.y - height / 4,
                    -(depth / 2 - 0.05)
                );
                this.scene.add(windowBack);
            }
        }

        // 左右两侧窗户
        for (let i = 0; i < windowsPerSide; i++) {
            if (i % 2 === 0) { // 交错排列窗户
                // 左面
                const windowLeft = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, windowSize * 0.6, windowSize),
                    windowMaterial
                );
                windowLeft.position.set(
                    width / 2 - 0.05,
                    floor.position.y - height / 4,
                    (depth / 2 - 1.5) - i * (depth / windowsPerSide)
                );
                this.scene.add(windowLeft);

                // 右面
                const windowRight = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, windowSize * 0.6, windowSize),
                    windowMaterial
                );
                windowRight.position.set(
                    -(width / 2 - 0.05),
                    floor.position.y - height / 4,
                    (depth / 2 - 1.5) - i * (depth / windowsPerSide)
                );
                this.scene.add(windowRight);
            }
        }
    }

    createStairs() {
        // 在主要建筑附近创建楼梯，用于楼层间移动
        this.stairs = []; // 存储楼梯信息

        const stairPositions = [
            { x: -23, z: -2, rotation: 0, destination: { floor: 1 } }, // 教学楼左侧楼梯
            { x: -17, z: 2, rotation: Math.PI, destination: { floor: 1 } }, // 教学楼右侧楼梯
            { x: -20, z: 5, rotation: Math.PI/2, destination: { floor: 1 } }, // 教学楼前方楼梯
            { x: 10, z: -10, rotation: Math.PI/2, destination: { floor: 1 } } // 图书馆入口
        ];

        stairPositions.forEach((pos, index) => {
            const stairGroup = new THREE.Group();
            stairGroup.position.set(pos.x, 0, pos.z);
            stairGroup.rotation.y = pos.rotation;

            // 创建楼梯台阶（Q版圆润风格）
            const numSteps = 6;
            const stepWidth = 2.5;
            const stepDepth = 0.6;
            const stepHeight = 0.4;

            for (let i = 0; i < numSteps; i++) {
                // 使用圆角矩形近似（通过较小的几何体组合）
                const stepGeometry = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
                // 马卡龙色系
                const stepMaterial = new THREE.MeshLambertMaterial({ color: 0xF0E68C }); // 卡拉麦朴色
                const step = new THREE.Mesh(stepGeometry, stepMaterial);

                step.position.y = stepHeight * (i + 0.5);
                step.position.z = -stepDepth * i;

                // 添加台阶边缘高亮效果
                const edgeGeometry = new THREE.BoxGeometry(stepWidth, stepHeight/3, stepDepth/5);
                const edgeMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFAF0 }); // 花白
                const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
                edge.position.set(0, stepHeight * 0.6, -stepDepth/2 + 0.05);
                step.add(edge);

                stairGroup.add(step);
            }

            // 添加扶手（Q版圆润风格）
            const railingGeometry = new THREE.CylinderGeometry(0.08, 0.08, 4, 12);
            const railingMaterial = new THREE.MeshLambertMaterial({ color: 0xB0C4DE }); // 矶石

            // 左扶手
            const leftRailing = new THREE.Mesh(railingGeometry, railingMaterial);
            leftRailing.position.set(stepWidth/2 + 0.1, 2, -numSteps*stepDepth/2);
            leftRailing.rotation.z = Math.PI/2;
            stairGroup.add(leftRailing);

            // 右扶手
            const rightRailing = new THREE.Mesh(railingGeometry, railingMaterial);
            rightRailing.position.set(-stepWidth/2 - 0.1, 2, -numSteps*stepDepth/2);
            rightRailing.rotation.z = Math.PI/2;
            stairGroup.add(rightRailing);

            stairGroup.userData = { type: 'staircase', destination: pos.destination };
            stairGroup.castShadow = true;

            // 保存楼梯引用
            this.stairs.push({
                object: stairGroup,
                destination: pos.destination
            });

            this.scene.add(stairGroup);
        });
    }

    initJoysticks() {
        // 初始化左摇杆（移动）
        const leftJoystickContainer = document.getElementById('leftJoystick');
        this.leftJoystick = nipplejs.create({
            zone: leftJoystickContainer,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 100
        });

        // 初始化右摇杆（预留）
        const rightJoystickContainer = document.getElementById('rightJoystick');
        this.rightJoystick = nipplejs.create({
            zone: rightJoystickContainer,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'gray',
            size: 100
        });

        // 绑定摇杆事件
        this.bindJoystickEvents();
    }

    drawAimingLine() {
        if (!this.aimingCtx) return;

        // 清除之前的绘制
        this.aimingCtx.clearRect(0, 0, this.aimingCanvas.width, this.aimingCanvas.height);

        // 获取玩家屏幕坐标
        const vector = new THREE.Vector3();
        vector.setFromMatrixPosition(this.player.matrixWorld);
        vector.project(this.camera);

        const playerScreenX = Math.round((vector.x + 1) * this.aimingCanvas.width / 2);
        const playerScreenY = Math.round((-vector.y + 1) * this.aimingCanvas.height / 2);

        // 计算瞄准点（基于摇杆方向）
        const aimDistance = 100; // 屏幕像素距离
        const aimX = playerScreenX + this.hookSystem.aimingVector.x * aimDistance;
        const aimY = playerScreenY + this.hookSystem.aimingVector.z * aimDistance;

        // 绘制瞄准线
        this.aimingCtx.beginPath();
        this.aimingCtx.moveTo(playerScreenX, playerScreenY);
        this.aimingCtx.lineTo(aimX, aimY);
        this.aimingCtx.strokeStyle = '#FF0000'; // 红色
        this.aimingCtx.lineWidth = 2;
        this.aimingCtx.stroke();

        // 绘制瞄准点
        this.aimingCtx.beginPath();
        this.aimingCtx.arc(aimX, aimY, 8, 0, Math.PI * 2);
        this.aimingCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        this.aimingCtx.fill();
    }

    clearAimingLine() {
        if (this.aimingCtx) {
            this.aimingCtx.clearRect(0, 0, this.aimingCanvas.width, this.aimingCanvas.height);
        }
    }

    shootHook() {
        // 计算钩子的方向和距离
        const hookDirection = this.hookSystem.aimingVector.clone();
        const hookDistance = 10; // 钩子最大距离

        // 计算钩子终点位置
        const hookEndPoint = new THREE.Vector3(
            this.player.position.x + hookDirection.x * hookDistance,
            this.player.position.y,
            this.player.position.z + hookDirection.z * hookDistance
        );

        // 检测是否有目标（目前只做演示）
        const hitResult = this.checkHookHit(hookEndPoint);

        if (hitResult.hit) {
            console.log("Hook hit a target!");
            this.handleHookHit(hitResult.target);
        } else {
            console.log("Hook missed!");
        }

        // 发射钩子的音效或视觉效果
        this.playHookEffect();
    }

    playHookEffect() {
        // 发射钩子的视觉效果
        // 创建钩子飞行动画
        const hookGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8);
        const hookMaterial = new THREE.MeshLambertMaterial({ color: 0xFF0000 });
        const hook = new THREE.Mesh(hookGeometry, hookMaterial);
        
        // 设置钩子初始位置
        hook.position.copy(this.player.position);
        hook.position.y += 1.5; // 从玩家身体中心发射
        
        // 设置钩子方向
        const direction = this.hookSystem.aimingVector.clone().normalize();
        hook.lookAt(hook.position.clone().add(direction));
        
        this.scene.add(hook);
        
        // 钩子飞行动画
        const speed = 0.5;
        const maxDistance = 10;
        let distance = 0;
        
        const animateHook = () => {
            if (distance >= maxDistance) {
                // 钩子达到最大距离，移除
                this.scene.remove(hook);
                return;
            }
            
            // 移动钩子
            hook.position.add(direction.clone().multiplyScalar(speed));
            distance += speed;
            
            // 继续动画
            requestAnimationFrame(animateHook);
        };
        
        animateHook();
        
        // 播放音效（如果浏览器支持）
        this.playSound('hook_shoot');
    }

    playSound(type) {
        // 简单的音效系统
        // 在实际游戏中，可以加载真实的音频文件
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            switch(type) {
                case 'hook_shoot':
                    oscillator.frequency.value = 200;
                    oscillator.type = 'sine';
                    gainNode.gain.value = 0.1;
                    break;
                case 'hook_hit':
                    oscillator.frequency.value = 400;
                    oscillator.type = 'square';
                    gainNode.gain.value = 0.15;
                    break;
                case 'bind':
                    oscillator.frequency.value = 300;
                    oscillator.type = 'triangle';
                    gainNode.gain.value = 0.2;
                    break;
            }
            
            oscillator.start();
            setTimeout(() => {
                oscillator.stop();
                audioContext.close();
            }, 200);
        } catch (e) {
            // 音频播放失败，忽略
            console.log('Audio not supported');
        }
    }

    checkHookHit(endPoint) {
        // 检测钩子是否击中目标
        // 创建从玩家到终点的射线
        const direction = new THREE.Vector3()
            .subVectors(endPoint, this.player.position)
            .normalize();
        
        const raycaster = new THREE.Raycaster(
            this.player.position.clone(),
            direction,
            0,
            10 // 最大检测距离
        );

        // 检测与测试NPC的碰撞
        if (this.testNPC) {
            const intersects = raycaster.intersectObject(this.testNPC, true);
            
            if (intersects.length > 0) {
                return { hit: true, target: this.testNPC };
            }
        }

        // 可以扩展检测其他NPC或玩家
        // 在多人游戏中，这里会检测所有其他玩家

        return { hit: false, target: null };
    }

    handleHookHit(target) {
        // 处理钩子命中的逻辑
        // 如果是狼钩到了羊，则触发捆绑机制
        if (this.playerRole === 'wolf' && target.role === 'sheep') {
            console.log("Wolf caught a sheep!");
            // 在完整的实现中，这会调用捆绑函数
        }
    }

    updateCamera() {
        if (!this.player) return;
        
        // 固定视角相机跟随（类似蛋仔派对）
        // 相机始终在角色后方偏上的固定位置
        const idealPosition = new THREE.Vector3(
            this.player.position.x,
            this.player.position.y + this.cameraConfig.height,
            this.player.position.z + this.cameraConfig.distance
        );

        // 使用lerp平滑插值，避免抖动
        this.camera.position.lerp(idealPosition, this.cameraConfig.smoothing);

        // 相机始终看向角色（稍微抬高一点，看向角色身体中心）
        const lookTarget = new THREE.Vector3(
            this.player.position.x,
            this.player.position.y + 1.5, // 看向角色身体中心
            this.player.position.z
        );
        
        this.camera.lookAt(lookTarget);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // 更新相机（始终跟随玩家）
        this.updateCamera();

        // 在躲藏阶段限制移动
        if (this.gameState === 'hiding' && this.player) {
            // 狼人显示观望动画
            if (this.playerRole === 'wolf') {
                // 狼人轻微旋转观望
                this.player.rotation.y = Math.sin(Date.now() / 1000) * 0.3;
            }
        }

        // 更新技能冷却
        this.updateSkillCooldowns();

        // 更新瞄准线（如果正在瞄准）
        if (this.hookSystem.aiming) {
            this.drawAimingLine();
        }

        // 检查道具拾取
        this.checkItemPickup();

        // 检查解救进度
        this.updateRescueProgress();

        // 检查门交互
        this.checkDoorInteraction();

        // 检查楼梯交互
        this.checkStairInteraction();

        // 检查天台跳跃
        if (this.currentFloor >= 2) { // 如果在高层
            this.checkRoofJump(); // 可以从天台跳下去
        }

        // 更新隐身效果
        this.updateInvisibility();

        // 更新道具旋转动画
        this.updateItemAnimations();

        this.renderer.render(this.scene, this.camera);
    }

    updateItemAnimations() {
        if (!this.items) return;
        
        for (const item of this.items) {
            // 旋转道具
            if (item.children[0]) {
                item.children[0].rotation.y += item.userData.rotationSpeed;
            }
            // 上下浮动
            if (item.children[0]) {
                item.children[0].position.y = 0.5 + Math.sin(Date.now() / 500) * 0.1;
            }
        }
    }

    updateSkillCooldowns() {
        const deltaTime = 1 / 60; // 假设60fps

        // 更新钩子冷却
        if (this.hookSystem.cooldown > 0) {
            this.hookSystem.cooldown -= deltaTime;
            this.updateHookCooldownUI();
        }

        // 更新加速技能冷却
        if (this.speedBoost.cooldown > 0) {
            this.speedBoost.cooldown -= deltaTime;
            this.updateSpeedCooldownUI();
        }

        // 检查加速技能持续时间
        if (this.speedBoost.active) {
            this.speedBoost.duration -= deltaTime;
            if (this.speedBoost.duration <= 0) {
                this.speedBoost.active = false;
                this.speedBoost.duration = 5; // 重置持续时间
                this.showNotification('加速结束');
            }
        }
    }

    updateHookCooldownUI() {
        const cooldownElement = document.getElementById('hookCooldown');
        if (cooldownElement) {
            if (this.hookSystem.cooldown > 0) {
                cooldownElement.textContent = Math.ceil(this.hookSystem.cooldown);
                cooldownElement.style.display = 'flex';
            } else {
                cooldownElement.style.display = 'none';
            }
        }
    }

    updateSpeedCooldownUI() {
        const cooldownElement = document.getElementById('speedCooldown');
        if (cooldownElement) {
            if (this.speedBoost.cooldown > 0) {
                cooldownElement.textContent = Math.ceil(this.speedBoost.cooldown);
                cooldownElement.style.display = 'flex';
            } else {
                cooldownElement.style.display = 'none';
            }
        }
    }

    activateSpeedBoost() {
        // 只有狼人可以使用加速技能
        if (this.playerRole !== 'wolf') return;
        
        // 检查冷却
        if (this.speedBoost.cooldown > 0) {
            this.showNotification('技能冷却中');
            return;
        }

        // 激活加速
        this.speedBoost.active = true;
        this.speedBoost.cooldown = this.speedBoost.maxCooldown;
        
        this.showNotification('加速启动！');
        this.playSound('speed_boost');
    }

    checkItemPickup() {
        if (!this.items || this.items.length === 0) return;

        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            const distance = this.player.position.distanceTo(item.position);

            if (distance < 1.5) { // 拾取范围
                this.pickupItem(item);
                this.scene.remove(item);
                this.items.splice(i, 1);
            }
        }
    }

    pickupItem(item) {
        switch(item.itemType) {
            case 'speedBoost':
                this.activeItems.speedBoost = true;
                setTimeout(() => {
                    this.activeItems.speedBoost = false;
                }, 5000);
                this.showNotification('🏃 加速鞋！速度提升5秒');
                break;
            case 'extraLife':
                this.playerLives++;
                this.updateLivesDisplay();
                this.showNotification('❤️ 复活护符！生命+1');
                break;
            case 'invisibility':
                this.activeItems.invisibility = true;
                setTimeout(() => {
                    this.activeItems.invisibility = false;
                }, 5000);
                this.showNotification('👻 隐身斗篷！隐身5秒');
                break;
            case 'purification':
                this.activeItems.purification = true;
                this.showNotification('✨ 净化工具！可解救被感染的队友');
                break;
        }
        
        this.playSound('item_pickup');
    }

    updateInvisibility() {
        if (this.player && this.player.children) {
            const opacity = this.activeItems.invisibility ? 0.3 : 1.0;
            this.player.children.forEach(child => {
                if (child.material) {
                    child.material.transparent = opacity < 1;
                    child.material.opacity = opacity;
                }
            });
        }
    }

    updateRescueProgress() {
        if (!this.rescueSystem.active) return;

        // 检查是否还在解救范围内
        if (this.rescueSystem.target) {
            const distance = this.player.position.distanceTo(this.rescueSystem.target.position);
            if (distance > 2) {
                // 离开解救范围，暂停解救
                this.rescueSystem.active = false;
                this.showNotification('解救暂停');
                return;
            }
        }
    }

    checkDoorInteraction() {
        if (!this.doors || this.doors.length === 0) return;

        let nearDoor = false;
        for (const door of this.doors) {
            const distance = this.player.position.distanceTo(door.position);
            if (distance < 2 && door.interactive) {
                nearDoor = true;
                this.currentNearDoor = door;
                break;
            }
        }

        const doorInteraction = document.getElementById('doorInteraction');
        if (doorInteraction) {
            doorInteraction.style.display = nearDoor ? 'block' : 'none';
        }
    }

    updateLivesDisplay() {
        const livesDisplay = document.getElementById('livesDisplay');
        if (livesDisplay) {
            livesDisplay.textContent = '❤️'.repeat(this.playerLives);
        }
    }

    showNotification(message) {
        const notification = document.getElementById('itemNotification');
        if (notification) {
            notification.textContent = message;
            notification.style.display = 'block';
            
            setTimeout(() => {
                notification.style.display = 'none';
            }, 3000);
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// 启动游戏
window.onload = () => {
    const game = new Game();
    
    // 绑定UI事件
    game.setupUIEvents();
};

// 在Game类中添加setupUIEvents方法
Game.prototype.setupUIEvents = function() {
    // 创建房间按钮
    const createRoomBtn = document.getElementById('createRoomBtn');
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', () => {
            const playerName = document.getElementById('playerName').value;
            if (!playerName) {
                alert('请输入昵称！');
                return;
            }
            this.createRoom(playerName);
        });
    }
    
    // 加入房间按钮
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', () => {
            const playerName = document.getElementById('playerName').value;
            const roomCode = document.getElementById('roomCodeInput').value;
            if (!playerName || !roomCode) {
                alert('请输入昵称和房间码！');
                return;
            }
            this.joinRoom(playerName, roomCode);
        });
    }
    
    // 开始游戏按钮
    const startGameBtn = document.getElementById('startGameBtn');
    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            this.startGame();
        });
    }
    
    // 加速技能按钮
    const speedBoostBtn = document.getElementById('speedBoostBtn');
    if (speedBoostBtn) {
        speedBoostBtn.addEventListener('click', () => {
            this.activateSpeedBoost();
        });
    }
    
    // 解救按钮
    const rescueBtn = document.getElementById('rescueBtn');
    if (rescueBtn) {
        let rescueInterval = null;
        
        rescueBtn.addEventListener('mousedown', () => {
            this.startRescue();
            rescueInterval = setInterval(() => {
                this.updateRescue();
            }, 100);
        });
        
        rescueBtn.addEventListener('mouseup', () => {
            clearInterval(rescueInterval);
            this.pauseRescue();
        });
        
        rescueBtn.addEventListener('mouseleave', () => {
            clearInterval(rescueInterval);
            this.pauseRescue();
        });
        
        // 触摸事件
        rescueBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startRescue();
            rescueInterval = setInterval(() => {
                this.updateRescue();
            }, 100);
        });
        
        rescueBtn.addEventListener('touchend', () => {
            clearInterval(rescueInterval);
            this.pauseRescue();
        });
    }
    
    // 开门按钮
    const openDoorBtn = document.getElementById('openDoorBtn');
    if (openDoorBtn) {
        openDoorBtn.addEventListener('click', () => {
            if (this.currentNearDoor) {
                this.toggleDoor(this.currentNearDoor);
            }
        });
    }
    
    // 身份选择按钮
    const selectSheep = document.getElementById('selectSheep');
    if (selectSheep) {
        selectSheep.addEventListener('click', () => {
            this.selectRole('sheep');
        });
    }
    
    const selectWolf = document.getElementById('selectWolf');
    if (selectWolf) {
        selectWolf.addEventListener('click', () => {
            this.selectRole('wolf');
        });
    }
    
    // 确认身份按钮
    const confirmRoleBtn = document.getElementById('confirmRoleBtn');
    if (confirmRoleBtn) {
        confirmRoleBtn.addEventListener('click', () => {
            this.confirmRole();
        });
    }
};

Game.prototype.createRoom = function(playerName) {
    // 生成6位数房间码
    this.roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    this.playerId = 'player_' + Date.now();
    this.isHost = true;
    
    // 显示等待房间
    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('waitingRoom').style.display = 'flex';
    document.getElementById('roomCodeDisplay').textContent = this.roomCode;
    document.getElementById('startGameBtn').style.display = 'block';
    
    // 添加房主到玩家列表
    this.updatePlayerList([{ name: playerName, role: 'host' }]);
    
    console.log('Room created:', this.roomCode);
};

Game.prototype.joinRoom = function(playerName, roomCode) {
    // 模拟加入房间（实际需要服务器验证）
    this.roomCode = roomCode;
    this.playerId = 'player_' + Date.now();
    this.isHost = false;
    
    // 显示等待房间
    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('waitingRoom').style.display = 'flex';
    document.getElementById('roomCodeDisplay').textContent = roomCode;
    
    console.log('Joined room:', roomCode);
};

Game.prototype.startGame = function() {
    // 显示身份选择界面
    document.getElementById('waitingRoom').style.display = 'none';
    document.getElementById('roleSelection').style.display = 'flex';
    
    console.log('Showing role selection...');
};

Game.prototype.selectRole = function(role) {
    // 移除之前的选中状态
    document.getElementById('selectSheep').classList.remove('selected');
    document.getElementById('selectWolf').classList.remove('selected');
    
    // 添加新的选中状态
    if (role === 'sheep') {
        document.getElementById('selectSheep').classList.add('selected');
    } else {
        document.getElementById('selectWolf').classList.add('selected');
    }
    
    // 启用确认按钮
    document.getElementById('confirmRoleBtn').disabled = false;
    
    // 保存选择的角色
    this.selectedRole = role;
};

Game.prototype.confirmRole = function() {
    if (!this.selectedRole) return;
    
    // 设置玩家角色
    this.playerRole = this.selectedRole;
    
    // 隐藏身份选择界面，显示游戏界面
    document.getElementById('roleSelection').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';
    
    // 显示狼人技能按钮
    if (this.playerRole === 'wolf') {
        document.getElementById('wolfSkills').style.display = 'block';
    }
    
    // 重新创建玩家（应用新角色）
    if (this.player) {
        this.scene.remove(this.player);
    }
    this.createPlayer();
    
    // 开始躲藏倒计时
    this.gameState = 'hiding';
    this.startHidingTimer();
    
    console.log('Game started! Role:', this.playerRole);
};

Game.prototype.updatePlayerList = function(players) {
    const playerList = document.getElementById('playerList');
    if (!playerList) return;
    
    playerList.innerHTML = '';
    players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        playerItem.innerHTML = `
            <span>${player.name}</span>
            <span class="player-role ${player.role}">${player.role === 'host' ? '房主' : '玩家'}</span>
        `;
        playerList.appendChild(playerItem);
    });
};

Game.prototype.startRescue = function() {
    // 查找附近被捆绑的队友
    if (!this.chairs) return;
    
    for (const chair of this.chairs) {
        if (chair.occupied && chair.occupant && chair.occupant.role === 'sheep') {
            const distance = this.player.position.distanceTo(chair.object.position);
            if (distance < 2) {
                this.rescueSystem.active = true;
                this.rescueSystem.target = chair.occupant;
                this.rescueSystem.chair = chair;
                break;
            }
        }
    }
};

Game.prototype.updateRescue = function() {
    if (!this.rescueSystem.active) return;
    
    this.rescueSystem.progress += 0.1; // 每次增加0.1秒
    
    // 更新进度条
    const progressBar = document.getElementById('rescueProgress');
    if (progressBar) {
        const percentage = (this.rescueSystem.progress / this.rescueSystem.requiredTime) * 100;
        progressBar.style.width = percentage + '%';
    }
    
    // 检查是否完成
    if (this.rescueSystem.progress >= this.rescueSystem.requiredTime) {
        this.completeRescue();
    }
};

Game.prototype.pauseRescue = function() {
    this.rescueSystem.active = false;
    // 进度归零
    this.rescueSystem.progress = 0;
    const progressBar = document.getElementById('rescueProgress');
    if (progressBar) {
        progressBar.style.width = '0%';
    }
};

Game.prototype.completeRescue = function() {
    if (!this.rescueSystem.target || !this.rescueSystem.chair) return;
    
    const target = this.rescueSystem.target;
    const chair = this.rescueSystem.chair;
    
    // 解救成功
    target.isBound = false;
    target.boundToChair = null;
    chair.occupied = false;
    chair.occupant = null;
    
    // 恢复颜色
    if (target.children && target.children[0]) {
        const colors = this.playerColors.sheep;
        target.children[0].material.color.set(colors.body);
    }
    
    this.showNotification('解救成功！');
    this.playSound('rescue');
    
    // 重置解救系统
    this.rescueSystem.active = false;
    this.rescueSystem.progress = 0;
    this.rescueSystem.target = null;
    this.rescueSystem.chair = null;
    
    const progressBar = document.getElementById('rescueProgress');
    if (progressBar) {
        progressBar.style.width = '0%';
    }
};