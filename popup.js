document.addEventListener("DOMContentLoaded", () => {
  const consentToggle = document.getElementById("consentToggle");
  const clearCacheBtn = document.getElementById("clearCache");
  const statusText = document.getElementById("status");
  const openTermsBtn = document.getElementById("openTerms");
  const closeTermsBtn = document.getElementById("closeTerms");
  const termsModal = document.getElementById("termsModal");

  // 버튼 초기 상태 비활성화
  clearCacheBtn.disabled = true;

  // 저장된 동의 여부 불러오기
  chrome.storage.local.get(["consent"], (result) => {
    const consentGiven = result.consent || false;
    consentToggle.checked = consentGiven;
    updateButtonState(consentGiven);
  });

  // 동의 여부 변경 시 저장 & 버튼 상태 업데이트
  consentToggle.addEventListener("change", () => {
    const isChecked = consentToggle.checked;
    chrome.storage.local.set({ consent: isChecked });
    updateButtonState(isChecked);

    statusText.innerHTML = isChecked
      ? "✅ <b>약관 동의 완료!</b> 기능이 활성화되었습니다.<br>사이트를 <b>새로고침</b> 해주세요."
      : "❌ <b>약관 취소 완료!</b> 기능을 사용할 수 없습니다.<br>사이트를 <b>새로고침</b> 해주세요.";
  });

  // 버튼 상태 업데이트 함수
  function updateButtonState(isEnabled) {
    clearCacheBtn.disabled = !isEnabled;
  }

  // 캐시 삭제 버튼 이벤트
  clearCacheBtn.addEventListener("click", () => {
    if (!consentToggle.checked) return;

    chrome.storage.local.get(null, (items) => {
      const keysToRemove = Object.keys(items).filter(
        (key) => key !== "consent"
      ); // "consent" 제외
      chrome.storage.local.remove(keysToRemove, () => {
        statusText.innerText = "🗑 일부 캐시가 삭제되었습니다! (동의 정보 유지)";
      });
    });
  });

  // 약관 모달 열기/닫기
  openTermsBtn.addEventListener("click", () => {
    termsModal.style.display = "flex";
  });
  closeTermsBtn.addEventListener("click", () => {
    termsModal.style.display = "none";
  });
});
