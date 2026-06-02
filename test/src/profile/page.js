console.info('Hello world!');

const REGEX = /\/profile\/(?<id>.+)/u;
const { id } = REGEX.exec(globalThis.location.pathname).groups;
document.querySelector('#profile_id').textContent = id;
