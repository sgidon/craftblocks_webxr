/* global AFRAME, THREE, firebase */

/**
 * hit-test component
 */
 AFRAME.registerComponent("ar-hit-test", {
  init: function() {
    
    let self = this;
    const putBt = document.querySelector("#putButton");
    const delBt = document.querySelector("#deleteButton");
    const manager = new blockManager(this.el.sceneEl);
    this.data.markerContainer = document.getElementById("marker-container");
    this.data.raycaster = document.querySelector("[raycaster]").components.raycaster;

    // session start
    this.el.sceneEl.renderer.xr.addEventListener("sessionstart", async () => {
      let renderer = this.el.sceneEl.renderer;
      let session = renderer.xr.getSession();
      let viewerSpace = await session.requestReferenceSpace("viewer");
      let xrHitTestSource = await session.requestHitTestSource({
        space: viewerSpace
      });

      document.body.classList.remove("normal-session");
      document.body.classList.remove("vr-session");
      document.body.classList.add("ar-session");
      self.data.renderer = renderer;
      self.data.xrHitTestSource = xrHitTestSource;
    });

    // session end
    this.el.sceneEl.renderer.xr.addEventListener("sessionend", async () => {
      document.body.classList.add("normal-session");
      document.body.classList.remove("vr-session");
      document.body.classList.remove("ar-session");
      self.data.xrHitTestSource = null;
    });

    // セットボタンクリックでブロックを置く
    putBt.addEventListener('touchstart', (e) => {
      e.preventDefault();
      let pos = self.el.getAttribute("position");
      let rot = self.el.getAttribute("rotation");
      manager.putBlock(pos, rot);
    })
    
    // DELボタンクリックでブロックを削除する
    delBt.addEventListener("touchstart", (e) => {
      e.preventDefault();
      manager.deleteBlock(self.data.deleteTarget);
    });

  },

  tick: function() {
    // Raycasterチェックして、なければHit-testチェックとする。
    // 本当は、どちらもチェックしてDistanceが短い方を有効とする必要があるが、
    // 面倒だしとくに支障は出ないと思うんでこの仕様にする。
    
    const frame = this.el.sceneEl.frame;
    if (!frame) return;

    // When hit block with raycaster
    this.data.raycaster.refreshObjects();
    let intersection = this.data.raycaster.intersections[0];
    
    // RaycasterがHitした場合、ぶつかった対象Blockを削除対象とし、ぶつかった位置を元にBlock作成場所を決定する。
    if ((this.data.raycaster.intersections) && (this.data.raycaster.intersections.length > 0)) {
      let pos = new THREE.Vector3();
      const intersect = this.data.raycaster.intersections[0]
      const intersectionPos = intersect.point;
      pos.x = Math.round(intersectionPos.x * 10) / 10;
      pos.y = Math.round(intersectionPos.y * 10) / 10;
      pos.z = Math.round(intersectionPos.z * 10) / 10;
      this.el.setAttribute("position", pos);
      
      let deleteTarget = intersect.object.el;
      if (!this.data.deleteTarget) {
        deleteTarget.setAttribute("opacity", 0.8);
        this.data.deleteTarget = deleteTarget;    
      } else if (deleteTarget != this.data.deleteTarget) {
        this.data.deleteTarget.setAttribute("opacity", 1);
        deleteTarget.setAttribute("opacity", 0.8);
        this.data.deleteTarget = deleteTarget;    
      }
      
      return;
    }

    // RaycasterがHitしなかった場合、Delete Targetをクリアする。
    if (this.data.deleteTarget) {
      this.data.deleteTarget.setAttribute("opacity", 1);
      this.data.deleteTarget = null;    
    }

    // hit-test in real world
    const xrHitTestSource = this.data.xrHitTestSource;
    if (xrHitTestSource) {
      const refSpace = this.data.renderer.xr.getReferenceSpace();
      const xrViewerPose = frame.getViewerPose(refSpace);

      const hitTestResults = frame.getHitTestResults(xrHitTestSource);
      if (hitTestResults.length > 0) {
        const pose = hitTestResults[0].getPose(refSpace);

        let pos = new THREE.Vector3();
        const hittestPos = pose.transform.position;
        pos.x = Math.round( hittestPos.x         * 10) / 10;
        pos.y = Math.round((hittestPos.y + 0.05) * 10) / 10;
        pos.z = Math.round( hittestPos.z         * 10) / 10;
        this.el.setAttribute("position", pos);

        // 世界座標のy方向に0.05だけ上がっている。向きを変えていないのが問題。
        // 向きについては面倒くさそうなので後で考える
        // this.el.object3D.quaternion.copy(pose.transform.orientation);
        
      }
      return;
    }
  }
});

/**
 * When AR-mode, hide entity.
 */
AFRAME.registerComponent("hide-in-ar-mode", {
  init: function() {
    this.el.setAttribute('visible', true);

    this.el.sceneEl.addEventListener("enter-vr", () => {
      if (this.el.sceneEl.is("ar-mode")) {
        this.el.setAttribute("visible", false);
      }
    });
    this.el.sceneEl.addEventListener("exit-vr", () => {
      this.el.setAttribute("visible", true);
    });
  }
});

/**
 * When AR-mode, show entity.
 */
 AFRAME.registerComponent("show-in-ar-mode", {
  init: function() {
    this.el.setAttribute('visible', false);

    this.el.sceneEl.addEventListener("enter-vr", () => {
      if (this.el.sceneEl.is("ar-mode")) {
        this.el.setAttribute("visible", true);
      }
    });
    this.el.sceneEl.addEventListener("exit-vr", () => {
      this.el.setAttribute("visible", false);
    });
  }
});

/**
 * block制御処理をまとめるクラス
 * @params: scene
 */
class blockManager {
  
  constructor(scene) {
    this._COLOR_BLOCK_IMG ="colorSelector.png";
    
    let self = this;
    this.scene = scene;
    
    this.blockSelector = document.querySelector('#blockSelector');
    this.colorPicker = document.querySelector('#colorPicker');
    
    this.blockSelector.addEventListener('change', function(e) {
      this.style.backgroundImage = "url(./images/" + this.value + ")";
    });
    
    this.colorPicker.addEventListener('change', function(e) {
      self.blockSelector.value = self._COLOR_BLOCK_IMG;
      self.blockSelector.style.backgroundImage = "url(./images/" + self._COLOR_BLOCK_IMG + ")";
    });
  }
  
  // Blockの作成
  putBlock(pos, rot) {
    let box = document.createElement("a-box");
    box.id = THREE.Math.generateUUID();
    box.className = "block";
    box.setAttribute("position", pos);
    box.setAttribute("rotation", rot);
    box.setAttribute("scale", "0.101 0.101 0.101")
    if (this.blockSelector.value != this._COLOR_BLOCK_IMG) {
      box.setAttribute("material","shader","standard");
      box.setAttribute("material","src",'#' + this.blockSelector.value);
    } else {
      box.setAttribute("material","shader","standard");
      box.setAttribute("color", this.colorPicker.value);
    }
    this.scene.appendChild(box);
  }
  
  // Blockの削除
  deleteBlock(targetBlock) {
    targetBlock.parentNode.removeChild(targetBlock);
  }
}
