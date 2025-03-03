chrome.webRequest.onCompleted.addListener(
  async (details) => {
    console.log("API 요청 감지:", details.url, details.tabId);
    if (details.url.includes("&version=1")) return;

    const consent = await new Promise((resolve) => {
      chrome.storage.local.get(["consent"], (result) =>
        resolve(result.consent)
      );
    });

    console.log("✅ 사용자 동의 상태:", consent);

    if (!consent) return;

    chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      args: [details.tabId, details.url],
      func: mainFunction,
    });
  },
  {
    urls: ["https://kaist.gov-dooray.com/v2/wapi/mails?*"],
  }
);

async function mainFunction(tabId, apiUrl) {
  const fetchWithRetryJson = async (
    url,
    options,
    retries = 10,
    delayMs = 1000
  ) => {
    console.log("🔄 Fetch 요청 시작:", url);
    for (let i = 0; i < retries; i++) {
      const response = await fetch(url, options);
      if (response.ok) return response.json();
      if (response.status === 429) {
        console.warn(
          `⏳ ${url} ${
            i + 1
          }회 시도 후 429 에러 발생! ${delayMs}ms 후 재시도...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        console.log("🚫 Fetch 요청 실패:", response.status);
      }
    }
    return null;
  };

  const getEmailList = async (apiUrl) => {
    const response = await fetchWithRetryJson(apiUrl + "&version=1", {
      method: "GET",
    });
    return response?.result?.contents || [];
  };

  const fetchEmailContents = async (emailList) => {
    const emailContents = {};
    await Promise.all(
      emailList.map(async (email, index) => {
        const emailResponse = await fetchWithRetryJson(
          `https://kaist.gov-dooray.com/v2/wapi/mails/${email.id}?render=html`,
          { method: "GET" }
        );
        if (!emailResponse.result.content.mail.flags.read) {
          fetchWithRetryJson(
            `https://kaist.gov-dooray.com/v2/wapi/mails/unread`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                mailIdList: [email.id],
              }),
            }
          );
        }
        emailContents[index] = {
          content: emailResponse?.result?.content?.body?.content || "",
          id: email.id,
        };
      })
    );
    return emailContents;
  };

  const showSummarizedEmails = async (emailContents, initWebUrl) => {
    const apiKey = await new Promise((resolve) => {
      chrome.storage.local.get(["apiToken"], (result) =>
        resolve(result.apiToken)
      );
    });

    emailContents = Object.values(emailContents);
    let currentUrl = window.location.href;

    for (let i = 0; i < emailContents.length; i++) {
      currentUrl = window.location.href;
      if (initWebUrl != currentUrl) return;

      const cachedSummary = await new Promise((resolve) => {
        chrome.storage.local.get([emailContents[i].id], (result) =>
          resolve(result[emailContents[i].id])
        );
      });

      if (cachedSummary) {
        console.log(`📂 캐시된 요약 불러오기: ${cachedSummary}`);
        currentUrl = window.location.href;
        if (initWebUrl != currentUrl) return;
        updateDomWithOneSummary(cachedSummary, i);
        continue;
      }

      console.log("🔹 요약 요청 메시지:", emailContents[i]);
      const responseData = await fetchWithRetryJson(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini-2024-07-18",
            messages: [
              {
                role: "system",
                content:
                  "You are a useful assistant to summarize emails concisely. You should summarize each of your emails in one sentence in Korean.",
              },
              {
                role: "user",
                content: `email:\n\n${emailContents[i].content}`,
              },
            ],
            max_tokens: 1024,
            n: 1,
          }),
        }
      );

      const summary = responseData?.choices[0]?.message?.content;
      console.log("🔹 요약 결과:", summary);
      chrome.storage.local.set({ [emailContents[i].id]: summary });

      currentUrl = window.location.href;
      if (initWebUrl != currentUrl) return;
      updateDomWithOneSummary(summary, i);
    }
  };

  const updateDomWithOneSummary = (summary, index) => {
    const listViewElements = document.querySelectorAll(".css-1eslgmx");
    const splitViewElements = document.querySelectorAll(".css-1nitlot");
    if (
      listViewElements[index] &&
      !listViewElements[index].parentElement?.classList.contains("wrapper")
    ) {
      const wrapper = document.createElement("div");
      wrapper.classList.add("wrapper");
      wrapper.style.display = "flex";
      wrapper.style.flexDirection = "column";
      wrapper.style.alignItems = "center";
      wrapper.style.gap = "5px";
      wrapper.style.width = "100%";

      listViewElements[index].style.width = "100%";
      listViewElements[index].style.paddingBottom = "2px";
      listViewElements[index].parentNode.insertBefore(
        wrapper,
        listViewElements[index]
      );

      const previewElements = document.querySelectorAll(
        '[data-testid="MailContentListPreview"]'
      );
      if (previewElements[index]) previewElements[index].style.display = "none";

      const summaryText = document.createElement("div");
      summaryText.classList.add("summary-text");
      summaryText.innerText = summary || "요약 불가";
      summaryText.style.fontSize = "14px";
      summaryText.style.color = "gray";
      summaryText.style.width = "100%";
      summaryText.style.paddingBottom = "10px";
      summaryText.style.textAlign = "start";
      summaryText.style.whiteSpace = "pre-wrap";
      summaryText.style.overflow = "hidden";
      summaryText.style.textOverflow = "ellipsis";

      wrapper.appendChild(listViewElements[index]);
      wrapper.appendChild(summaryText);
    } else if (splitViewElements[index]) {
      const previewElements = document.querySelectorAll(
        '[data-testid="MailContentListPreview"]'
      );
      if (!previewElements[index]) return;
      previewElements[index].style.whiteSpace = "pre-wrap";
      previewElements[index].innerText = summary || "요약 불가";
    }
  };

  try {
    const initWebUrl = window.location.href;
    const emailList = await getEmailList(apiUrl);
    if (!emailList.length) return console.warn("📭 이메일이 없습니다.");

    console.log("📩 이메일 목록:", emailList);
    const emailContents = await fetchEmailContents(emailList);
    console.log("📜 이메일 본문:", emailContents);

    await showSummarizedEmails(emailContents, initWebUrl);
  } catch (error) {
    console.error("⚠️ 이메일 데이터 처리 중 오류 발생:", error);
  }
}
