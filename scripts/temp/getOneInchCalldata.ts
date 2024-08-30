import axios from "axios";
import dotenv from 'dotenv'
dotenv.config()

async function main() {

    let config = {
        headers: {
            Authorization: `Bearer ${process.env.ONEINCH_API_KEY!}`,
        },
    };
    
    const walletAddress = "0x93069da82B264E94068aA991b88b3478cf0861BE"
    const src = "0x912CE59144191C1204E64559FE8253a0e49E6548"
    const dst = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
    const amount = 200000000000000000
    const from = "0x9e75c225f20638deae9273CE2a7c09009b7811a0"
    const slippage = 1
    let url = `https://api.1inch.dev/swap/v6.0/42161/swap?src=${src}&dst=${dst}&amount=${amount}&from=${from}&slippage=${slippage}&disableEstimate=true&origin=${walletAddress}`;
    let res = await axios.get(url, config);
    console.log(res.data.dstAmount)
    console.log(res.data.tx.data)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
