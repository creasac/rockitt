const enableActionOpen = async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true,
    });
  } catch (error) {
    console.error('Unable to enable side panel action behavior.', error);
  }
};

export default defineBackground(() => {
  void enableActionOpen();

  chrome.runtime.onInstalled.addListener(() => {
    void enableActionOpen();
  });

  chrome.runtime.onStartup.addListener(() => {
    void enableActionOpen();
  });
});
