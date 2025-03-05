chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.url.includes("&version=1")) return;

    const consent = await new Promise((resolve) => {
      chrome.storage.local.get(["consent"], (result) =>
        resolve(result.consent)
      );
    });

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

  const getCachedContent = async (emailId) => {
    return new Promise((resolve) => {
      chrome.storage.local.get(["content_" + emailId], (result) =>
        resolve(result["content_" + emailId])
      );
    });
  };

  const setCachedContent = async (emailId, content) => {
    chrome.storage.local.set({ ["content_" + emailId]: content });
  };

  const getCachedSummary = async (emailId) => {
    return new Promise((resolve) => {
      chrome.storage.local.get(["summary_" + emailId], (result) =>
        resolve(result["summary_" + emailId])
      );
    });
  };

  const setCachedSummary = async (emailId, summary) => {
    chrome.storage.local.set({ ["summary_" + emailId]: summary });
  };

  const divideEmailList = async (emailList) => {
    const cachedEmailList = await Promise.all(
      emailList.map(async (email, index) => {
        const content = await getCachedContent(email.id);
        const summary = await getCachedSummary(email.id);
        return {
          content: content,
          summary: summary,
          id: email.id,
          index: index,
        };
      })
    );

    const contentAndSummaryCached = [];
    const contentCached = [];
    const noCached = [];

    for (const cachedEmail of cachedEmailList) {
      if (cachedEmail.content && cachedEmail.summary) {
        contentAndSummaryCached.push(cachedEmail);
      } else if (cachedEmail.content && !cachedEmail.summary) {
        contentCached.push(cachedEmail);
      } else {
        noCached.push(cachedEmail);
      }
    }

    return { contentAndSummaryCached, contentCached, noCached };
  };

  const fetchEmailContents = async (emailList) => {
    const emailContents = [];
    await Promise.all(
      emailList.map(async (email) => {
        const emailResponse = await fetchWithRetryJson(
          `https://kaist.gov-dooray.com/v2/wapi/mails/${email.id}?render=html`,
          { method: "GET" }
        );
        console.log(email.id);
        const content = emailResponse?.result?.content?.body?.content || "";
        setCachedContent(email.id, content);
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

        emailContents.push({ ...email, content: content });
      })
    );
    return emailContents;
  };

  const fetchLLM = async (emailContents, initWebUrl) => {
    const apiKey = await new Promise((resolve) => {
      chrome.storage.local.get(["apiToken"], (result) =>
        resolve(result.apiToken)
      );
    });

    for (const email of emailContents) {
      console.log("🔹 요약 요청 메시지:", email);
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
                content: `email:\n\n${email.content}`,
              },
            ],
            max_tokens: 1024,
            n: 1,
          }),
        }
      );
      const summary = responseData?.choices[0]?.message?.content;
      console.log("🔹 요약 결과:", summary);
      setCachedSummary(email.id, summary);

      currentUrl = window.location.href;
      if (initWebUrl != currentUrl) return;
      updateDomWithOneSummary(summary, email.index);
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

  const summary = async () => {
    try {
      const initWebUrl = window.location.href;
      const emailList = await getEmailList(apiUrl);
      if (!emailList.length) return console.warn("📭 이메일이 없습니다.");
      const { contentAndSummaryCached, contentCached, noCached } =
        await divideEmailList(emailList);

      console.log(contentAndSummaryCached, contentCached, noCached);

      if (initWebUrl == window.location.href) {
        contentAndSummaryCached.forEach((email) => {
          updateDomWithOneSummary(email.summary, email.index);
        });
      }

      const emails = await fetchEmailContents(noCached);
      console.log("emails", emails.concat(contentCached));
      await fetchLLM(emails.concat(contentCached), initWebUrl);
    } catch (error) {
      console.error("⚠️ 이메일 데이터 처리 중 오류 발생:", error);
    }
  };

  summary();
}
