import axios from "axios";




async function main() {

    let config = {
        headers: {
            Authorization: `Bearer k5YhC6RsrmL96KoqpKJTy9AuRBH61sRg`,
        },
    };
    
    const src = "0x912CE59144191C1204E64559FE8253a0e49E6548"
    const dst = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
    const amount = 200000000000000000
    const from = "0xF3EEA34C9F33d8BA633C938c2ac17cD4B4F25D50"
    const slippage = 2
    const walletAddress = "0xEb608fE026a4F54df43E57A881D2e8395652C58D"
    let url = `https://api.1inch.dev/swap/v6.0/42161/swap?src=${src}&dst=${dst}&amount=${amount}&from=${from}&slippage=${slippage}&disableEstimate=true&receiver=${from}&origin=${walletAddress}`;
    let res = await axios.get(url, config);
    console.log(res)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
