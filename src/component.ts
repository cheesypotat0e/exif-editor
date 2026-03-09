class SampleComponent extends HTMLElement {
  date: Date | null = null;

  constructor() {
    super();
    // attach a shadow DOM to the component
    // mode open means the component is accessible from the outside
    const shadow = this.attachShadow({ mode: "closed" });

    // const wrapper = document.createElement("div");
    // wrapper.className = "sample-component";

    // const title = document.createElement("h3");
    // title.textContent = "Sample Web Component";

    // const content = document.createElement("p");
    // content.textContent = "This is a simple custom element Web Component!";

    // wrapper.appendChild(title);
    // wrapper.appendChild(content);
    const slashSeperator1 = document.createElement("span");
    slashSeperator1.className = "date-picker-slash-seperator";
    slashSeperator1.textContent = "/";
    slashSeperator1.style.marginRight = "0.5em";

    const slashSeperator2 = document.createElement("span");
    slashSeperator2.className = "date-picker-slash-seperator";
    slashSeperator2.textContent = "/";
    slashSeperator2.style.marginRight = "0.5em";

    const wrapper = document.createElement("div");
    wrapper.className = "date-picker-component";

    const yearInput = document.createElement("input");
    yearInput.className = "year-input";
    yearInput.type = "number";
    yearInput.placeholder = "YYYY";
    yearInput.min = "1900";
    yearInput.max = "2100";
    yearInput.step = "1";

    const monthInput = document.createElement("input");
    monthInput.className = "month-input";
    monthInput.type = "number";
    monthInput.placeholder = "MM";
    monthInput.min = "1";
    monthInput.max = "12";
    monthInput.step = "1";

    const dayInput = document.createElement("input");
    dayInput.className = "day-input";
    dayInput.type = "number";
    dayInput.placeholder = "DD";
    dayInput.min = "1";
    dayInput.max = "31";
    dayInput.step = "1";

    wrapper.appendChild(monthInput);
    wrapper.appendChild(slashSeperator1);
    wrapper.appendChild(dayInput);
    wrapper.appendChild(slashSeperator2);
    wrapper.appendChild(yearInput);

    const style = document.createElement("style");

    style.textContent = `
      .sample-component {
        padding: 1em;
        border: 2px solid #007bff;
        border-radius: 6px;
        background: #f4f8ff;
        color: #1a237e;
        font-family: sans-serif;
        margin: 0.5em 0;
      }
      .sample-component h3 {
        margin: 0 0 0.25em 0;
        font-size: 1.1em;
      }
      .sample-component p {
        margin: 0;
        font-size: 0.95em;
      }

      .year-input,
      .month-input,
      .day-input {
        all: unset;
        box-sizing: border-box;
        /* Hide number input arrows/spinners */
        -moz-appearance: textfield;
        font-family: monospace;
        font-size: 1.5em;
        margin-right: 0.5em;
      }

      .year-input::-webkit-inner-spin-button,
      .year-input::-webkit-outer-spin-button,
      .month-input::-webkit-inner-spin-button,
      .month-input::-webkit-outer-spin-button,
      .day-input::-webkit-inner-spin-button,
      .day-input::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      .month-input,
      .day-input {
        width: 2ch;
      }

      .year-input {
        width: 4ch;
      }
    `;

    shadow.appendChild(style);
    shadow.appendChild(wrapper);
  }
}

customElements.define("sample-component", SampleComponent);
