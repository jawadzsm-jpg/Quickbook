// Print previews are written into a window.open("") popup, which inherits the app's Content-Security-Policy, so inline
// handlers such as onclick="window.print()" do not run there. Toolbar buttons carry data-popup-action instead, and the
// opener wires them after document.close().
export function wirePopupActions(popup: Window) {
  popup.document.querySelectorAll<HTMLElement>("[data-popup-action]").forEach((button) => {
    button.addEventListener("click", () => { if (button.dataset.popupAction === "close") popup.close(); else popup.print(); });
  });
}
