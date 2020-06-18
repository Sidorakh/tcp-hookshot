const webhooks = document.querySelectorAll('.webhook-item');
for (const webhook of webhooks) {
    const txt = webhook.querySelector(`input[name="webhook-name"]`);
    const btn = webhook.querySelector('.edit-button');
    const secret = webhook.querySelector('.webhook-secret-span');
    txt.addEventListener('input',()=>{
        btn.disabled = false;
    });
    btn.addEventListener('click',()=>{
        btn.disabled=true;
    });
    secret.addEventListener('click',()=>{
        if (secret.classList.contains('webhook-secret-hidden')) {
            secret.classList.remove('webhook-secret-hidden');
        } else {
            secret.classList.add('webhook-secret-hidden');
        }
    });
}
function copy(elem) {
    navigator.clipboard.writeText(elem.innerText != undefined ? elem.innerText : elem.value);
}