/**
 * [INPUT]: 依赖对话挂载槽、机位原输入/动作和 floor-plan-camera-presentation 的状态属性
 * [OUTPUT]: 发布机位画布就绪信号，复用原上传、提示词、发送及恢复，底栏提示跟随收展
 * [POS]: public 的首页机位对话适配层，生成和校验继续由原机位控制器处理
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function bindHomeImageCamera(root, slots, { onChange, onCanvasChange }) {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const prompts = root.querySelector(".home-image-chat-camera-inputs");
  const thumbnail = root.querySelector(".home-image-chat-camera-thumbnail");
  const status = root.querySelector(".home-image-chat-camera-status");
  const attachLabel = root.querySelector(".home-image-chat-attach-label");
  let active = false;
  let expanded = false;
  let controls;
  let childBody;
  const controllerObserver = new view.MutationObserver(sync);
  const slotsObserver = new view.MutationObserver(sync);

  function syncPlacementNote() {
    status.classList.toggle("sr-only", expanded && status.hasAttribute("data-camera-placement"));
  }

  function setChildBody(body) {
    if (body === childBody) return;
    childBody?.classList.remove("plan-camera-conversation");
    body?.classList.add("plan-camera-conversation");
    childBody = body;
  }

  function restore() {
    controllerObserver.disconnect();
    if (!controls) return;
    for (const { field, marker } of controls.fields) marker.replaceWith(field);
    controls.refreshMarker.replaceWith(controls.refresh);
    controls.maintenance.remove();
    controls.sourceSection.classList.remove("home-image-chat-camera-origin-upload");
    controls.nativeStatus.removeAttribute("data-home-camera-redundant");
    controls = null;
  }

  function adopt(settings, actions) {
    const source = settings.querySelector("#camera-sourceInput");
    const refresh = actions.querySelector("#camera-refresh");
    const generate = actions.querySelector("#camera-generate");
    const nativeStatus = actions.querySelector("#camera-status");
    if (!source || !refresh || !generate || !nativeStatus) return;
    const sourceSection = source.closest("section");
    const sourceName = settings.querySelector("#camera-sourceName");
    const sourceThumbnail = settings.querySelector("#camera-sourceThumbnail");
    sourceSection.classList.add("home-image-chat-camera-origin-upload");
    const fields = [...settings.querySelectorAll("#camera-directPromptField, #camera-requirementsField")].map(field => {
      const marker = doc.createComment("机位输入原位置");
      field.before(marker);
      prompts.append(field);
      return { field, marker };
    });
    const refreshMarker = doc.createComment("机位刷新原位置");
    refresh.before(refreshMarker);
    const maintenance = doc.createElement("div");
    maintenance.className = "home-image-chat-camera-maintenance";
    settings.append(maintenance);
    controls = { settings, actions, source, sourceSection, sourceName, sourceThumbnail, refresh, generate,
      nativeStatus, fields, refreshMarker, maintenance };
    const options = { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ["data-camera-source", "data-camera-canvas", "data-camera-busy", "data-camera-pending", "data-camera-blocked", "hidden", "disabled", "aria-label", "src"] };
    for (const node of [settings, actions, prompts]) controllerObserver.observe(node, options);
  }

  function sync(mutations = []) {
    if (!active) return;
    const body = slots.mount.querySelector("iframe:not([hidden])")?.contentDocument?.body;
    setChildBody(body);
    const settings = slots.parameters.querySelector("#camera-settings");
    const actions = slots.actions.querySelector("#camera-actions");
    if (settings !== controls?.settings || actions !== controls?.actions) {
      restore();
      if (settings && actions) adopt(settings, actions);
    }
    const canvasReady = settings?.dataset.cameraCanvas === "ready";
    const busy = settings?.dataset.cameraBusy === "true";
    root.dataset.cameraSource = canvasReady ? "ready" : "empty";
    if (controls) {
      const pending = settings.dataset.cameraPending === "true" && !busy;
      if (pending && controls.refresh.parentNode !== controls.refreshMarker.parentNode) controls.refreshMarker.after(controls.refresh);
      if (!pending && controls.refresh.parentNode !== controls.maintenance) controls.maintenance.append(controls.refresh);
    }
    const hasSource = settings?.dataset.cameraSource === "ready";
    const image = hasSource ? controls?.sourceThumbnail?.getAttribute("src") : "";
    const sourceReplaced = mutations.some(({ target, attributeName }) =>
      target === controls?.sourceThumbnail && attributeName === "src");
    if (image && thumbnail.getAttribute("src") !== image) thumbnail.src = image;
    if (!image) thumbnail.removeAttribute("src");
    thumbnail.hidden = !image;
    const blocked = settings?.dataset.cameraBlocked || "";
    const needsPlacement = blocked === "请在平面图上放置相机";
    const note = needsPlacement ? "请先放置相机" : blocked;
    if (status.textContent !== note) status.textContent = note;
    status.toggleAttribute("data-camera-placement", needsPlacement);
    status.hidden = !status.textContent || (status.textContent === "请上传平面图" && !hasSource);
    onCanvasChange(canvasReady, sourceReplaced);
    syncPlacementNote();
    if (controls) {
      const nativeText = controls.nativeStatus.textContent;
      controls.nativeStatus.toggleAttribute("data-home-camera-redundant", nativeText === "机位已设置，可以生成" ||
        (!status.hidden && (nativeText === blocked || nativeText === "请填写用于直出的提示词")));
    }
    attachLabel.textContent = hasSource ? "更换平面图" : "上传平面图";
    onChange();
  }

  return {
    active: () => active,
    setActive(value) {
      if (active === value) return;
      active = value;
      prompts.hidden = !active;
      attachLabel.hidden = !active;
      if (active) {
        for (const slot of [slots.mount, slots.parameters, slots.actions]) {
          slotsObserver.observe(slot, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-ready"] });
        }
        sync();
      } else {
        slotsObserver.disconnect();
        restore();
        setChildBody(null);
        delete root.dataset.cameraSource;
        thumbnail.hidden = status.hidden = true;
        thumbnail.removeAttribute("src");
      }
    },
    setPanelExpanded(value) {
      expanded = value;
      syncPlacementNote();
    },
    textField: () => active ? prompts.querySelector(".plan-camera-field:not([hidden]) textarea") : null,
    attach: () => controls?.source.click(),
    send: () => controls?.generate.click(),
    upload(files) {
      if (!controls || controls.source.disabled || !files[0]) return;
      const data = new view.DataTransfer();
      data.items.add(files[0]);
      controls.source.files = data.files;
      controls.source.dispatchEvent(new view.Event("change", { bubbles: true }));
    },
    syncControls(attach, submit) {
      attach.disabled = !controls || controls.source.disabled;
      const name = thumbnail.hidden ? "" : controls?.sourceName?.textContent;
      const label = name ? `${attachLabel.textContent} · ${name}` : attachLabel.textContent;
      attach.title = label;
      attach.setAttribute("aria-label", label);
      submit.disabled = !controls || controls.generate.disabled;
      submit.setAttribute("aria-label", controls?.generate.getAttribute("aria-label") || "生成室内效果图");
      submit.setAttribute("aria-busy", controls?.settings.dataset.cameraBusy || "false");
      submit.setAttribute("aria-describedby", status.id);
    },
  };
}
