document.addEventListener('DOMContentLoaded', () => {
  const homeView = document.getElementById('home');
  const emergencyView = document.getElementById('emergency');
  const decisionView = document.getElementById('decision');

  // Buttons on home
  const btnEmergency = document.getElementById('btnEmergency');
  const btnUnsure = document.getElementById('btnUnsure');

  // Buttons inside other views
  const btnBackFromEmergency = document.getElementById('btnBackFromEmergency');
  const btnRestart = document.getElementById('btnRestart');
  const btnHomeFromResult = document.getElementById('btnHomeFromResult');

  // Decision flow elements
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const step3 = document.getElementById('step3');
  const resultMessage = document.getElementById('result-message');
  let isConscious = null;
  let selectedPart = null;

  function showView(viewId) {
    // Hide all
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
  }

  function resetDecisionFlow() {
    // Reset steps
    step1.classList.add('active');
    step2.classList.remove('active');
    step3.classList.remove('active');
    isConscious = null;
    selectedPart = null;
    // Reset selection highlight
    document.querySelectorAll('#body-svg .body-part').forEach((part) => {
      part.classList.remove('selected');
    });
  }

  function showStep(stepNumber) {
    step1.classList.remove('active');
    step2.classList.remove('active');
    step3.classList.remove('active');
    if (stepNumber === 1) step1.classList.add('active');
    if (stepNumber === 2) step2.classList.add('active');
    if (stepNumber === 3) step3.classList.add('active');
  }

  function getRecommendation(conscious, part) {
    // Provide simple recommendations based on severity
    if (!conscious) {
      return (
        '反応がない場合は呼吸や脈を確認し、すぐに救急車（119）を呼んでください。可能であれば心肺蘇生（CPR）を開始します。'
      );
    }
    if (part === 'head' || part === 'torso') {
      return (
        '重大な損傷の可能性があります。出血があれば圧迫して止血し、安静にしながら救急車（119）を呼んでください。'
      );
    }
    // arms or legs
    return (
      '出血部位を圧迫して止血し、患部を心臓より高く保ちましょう。症状が改善しない場合は救急車（119）を呼んでください。'
    );
  }

  // Event listeners
  btnEmergency.addEventListener('click', () => {
    showView('emergency');
  });
  btnUnsure.addEventListener('click', () => {
    showView('decision');
    resetDecisionFlow();
  });
  btnBackFromEmergency.addEventListener('click', () => {
    showView('home');
  });
  btnRestart.addEventListener('click', () => {
    resetDecisionFlow();
    showStep(1);
  });
  btnHomeFromResult.addEventListener('click', () => {
    showView('home');
  });

  // Step1 options
  document.querySelectorAll('#step1 .option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const answer = btn.getAttribute('data-answer');
      isConscious = answer === 'yes';
      showStep(2);
    });
  });

  // Step2: body part selection
  document.querySelectorAll('#body-svg .body-part').forEach((partElem) => {
    partElem.addEventListener('click', () => {
      // Remove previous selection
      document.querySelectorAll('#body-svg .body-part').forEach((p) => p.classList.remove('selected'));
      partElem.classList.add('selected');
      selectedPart = partElem.getAttribute('data-part');
      // Compute recommendation
      const msg = getRecommendation(isConscious, selectedPart);
      resultMessage.textContent = msg;
      showStep(3);
    });
  });
});