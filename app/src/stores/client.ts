import { acceptHMRUpdate, defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'
import { ListResult } from './ListResult'
import { ChainClient, chainFactory } from '~/network/Chain'
import type { ChainError } from '~/network/chain-error'
import type {
  Arbitrator,
  Denom,
  FetchOffersArgs,
  FiatCurrency,
  HubConfig,
  NewTrade,
  OfferResponse,
  PatchOffer,
  PostOffer,
  Profile,
  TradeInfo,
  UserWallet,
} from '~/types/components.interface'
import { LoadingState, OfferState } from '~/types/components.interface'
import type { Secrets } from '~/utils/crypto'
import { generateKeys } from '~/utils/crypto'

export const useClientStore = defineStore({
  id: 'client',
  state: () => {
    return {
      chainClient: <ChainClient>ChainClient.kujiraTestnet, // TODO call setClient in the App.vue setup function to properly init a chain adapter
      client: chainFactory(ChainClient.kujiraTestnet),
      userWallet: <UserWallet>{ isConnected: false, address: 'undefined' },
      secrets: useLocalStorage('secrets', new Map<string, Secrets>()),
      profile: <Profile>{},
      fiatPrices: new Map<String, Map<String, number>>(),
      offers: <ListResult<OfferResponse>>ListResult.loading(),
      myOffers: <ListResult<OfferResponse>>ListResult.loading(),
      trades: <ListResult<TradeInfo>>ListResult.loading(),
      arbitrators: <ListResult<Arbitrator>>ListResult.loading(),
      openDisputes: <ListResult<TradeInfo>>ListResult.loading(),
      closedDisputes: <ListResult<TradeInfo>>ListResult.loading(),
      loadingState: <LoadingState>LoadingState.dismiss(),
    }
  },
  actions: {
    /**
     * Set the blockchain
     * @param {ChainClient} chainClient - The Blockchain backend to connect to
     */
    async setClient(chainClient: ChainClient) {
      this.$reset()
      // TODO disconnect old chain adapter
      this.chainClient = chainClient
      this.client = chainFactory(this.chainClient)
      await this.client.init()
    },
    async connectWallet() {
      try {
        await this.client.connectWallet()
        const address = this.client.getWalletAddress()
        await this.syncSecrets(address)
        this.userWallet = { isConnected: true, address }
        await this.fetchArbitrators()
      } catch (e) {
        this.userWallet = { isConnected: false, address: 'undefined' }
        alert((e as ChainError).message)
      }
    },
    async connectSeedPhrase() {
      try {
        await this.client.connectSeedPhrase()
        const address = this.client.getWalletAddress()
        await this.syncSecrets(address)
        this.userWallet = { isConnected: true, address }
        await this.fetchArbitrators()
      } catch (e) {
        this.userWallet = { isConnected: false, address: 'undefined' }
        alert((e as ChainError).message)
      }
    },
    getHubConfig(): HubConfig {
      return this.client.getHubConfig()
    },
    async fetchProfile() {
      this.profile = await this.client.fetchProfile()
    },
    async syncSecrets(address: string) {
      await this.fetchProfile()
      const secrets = this.secrets.get(address) ?? (await generateKeys())
      if (!this.secrets.has(address)) {
        this.secrets.set(address, secrets)
      }
      console.log(secrets)
    },
    getSecrets() {
      const address = this.client.getWalletAddress()
      return this.secrets.get(address)!
    },
    async fetchOffers(offersArgs: FetchOffersArgs) {
      this.offers = ListResult.loading()
      try {
        const listOffers = await this.client.fetchOffers(offersArgs)
        this.offers = ListResult.success(listOffers)
      } catch (e) {
        this.offers = ListResult.error(e as ChainError)
      }
    },
    async fetchMyOffers() {
      this.myOffers = ListResult.loading()
      try {
        const listMyOffers = await this.client.fetchMyOffers()
        this.myOffers = ListResult.success(listMyOffers)
      } catch (e) {
        this.myOffers = ListResult.error(e as ChainError)
      }
    },
    async createOffer(postOffer: PostOffer) {
      this.loadingState = LoadingState.show('Creating Offer...')
      try {
        await this.client.createOffer(postOffer)
        await this.fetchProfile()
        await this.fetchMyOffers()
      } catch (e) {
        // TODO handle error
        alert((e as ChainError).message)
        console.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async updateOffer(updateOffer: PatchOffer) {
      this.loadingState = LoadingState.show('Updating Offer...')
      try {
        await this.client.updateOffer(updateOffer)
        await this.fetchMyOffers()
      } catch (e) {
        // TODO handle error
        alert((e as ChainError).message)
        console.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async unarchiveOffer(updateOffer: PatchOffer) {
      this.loadingState = LoadingState.show('Archiving Offer...')
      try {
        updateOffer.state = OfferState.paused
        await this.client.updateOffer(updateOffer)
        await this.fetchMyOffers()
      } catch (e) {
        // TODO handle error
        alert((e as ChainError).message)
        console.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async openTrade(trade: NewTrade) {
      this.loadingState = LoadingState.show('Opening trade...')
      try {
        const trade_id = await this.client.openTrade(trade)
        await this.fetchProfile()
        const route = trade_id === '' ? { name: 'Trades' } : { name: 'TradeDetail', params: { id: trade_id } }
        await this.router.push(route)
      } catch (e) {
        // TODO handle error
        alert((e as ChainError).message)
        console.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async fetchMyTrades() {
      this.trades = ListResult.loading()
      try {
        const tradesList = await this.client.fetchTrades()
        this.trades = ListResult.success(tradesList)
      } catch (e) {
        this.trades = ListResult.error(e as ChainError)
      }
    },
    async fetchTradeDetail(tradeId: string) {
      // TODO the fetchTradeDetail should return a TradeInfo
      const tradeInfo = await this.client.fetchTradeDetail(tradeId)
      return tradeInfo
    },
    async fetchArbitrators() {
      this.arbitrators = ListResult.loading()
      try {
        const arbitratorsList = await this.client.fetchArbitrators()
        this.arbitrators = ListResult.success(arbitratorsList)
      } catch (e) {
        this.arbitrators = ListResult.error(e as ChainError)
      }
    },
    async fetchDisputedTrades() {
      this.openDisputes = ListResult.loading()
      this.closedDisputes = ListResult.loading()
      try {
        const disputedTrades = await this.client.fetchDisputedTrades()
        this.openDisputes = ListResult.success(disputedTrades.openDisputes)
        this.closedDisputes = ListResult.success(disputedTrades.closedDisputes)
      } catch (e) {
        console.error(e)
      }
    },
    async fetchFiatPriceForDenom(fiat: FiatCurrency, denom: Denom) {
      try {
        const price = await this.client.fetchFiatPriceForDenom(fiat, denom)
        if (this.fiatPrices.has(fiat)) {
          this.fiatPrices.get(fiat)?.set(denom.native, price.price)
        } else {
          const priceForDenom = new Map([[denom.native, price.price]])
          this.fiatPrices.set(fiat, priceForDenom)
        }
      } catch (e) {
        console.error(e)
      }
    },
    async acceptTradeRequest(tradeId: string, makerContact: string) {
      this.loadingState = LoadingState.show('Accepting trade...')
      try {
        await this.client.acceptTradeRequest(tradeId, makerContact)
        await this.fetchTradeDetail(tradeId)
      } catch (e) {
        // TODO handle error
        alert((e as ChainError).message)
        console.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async cancelTradeRequest(tradeId: string) {
      this.loadingState = LoadingState.show('Canceling trade...')
      try {
        await this.client.cancelTradeRequest(tradeId)
        await this.fetchTradeDetail(tradeId)
      } catch (e) {
        // TODO handle error
        alert((e as ChainError).message)
        console.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async fundEscrow(tradeInfo: TradeInfo, makerContact?: string) {
      this.loadingState = LoadingState.show('Funding trade...')
      try {
        await this.client.fundEscrow(tradeInfo, makerContact)
        await this.fetchTradeDetail(tradeInfo.trade.id)
      } catch (e) {
        // TODO handle error
        alert((e as ChainError).message)
        console.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async setFiatDeposited(tradeId: string) {
      this.loadingState = LoadingState.show('Marking trade as paid...')
      try {
        await this.client.setFiatDeposited(tradeId)
        await this.fetchTradeDetail(tradeId)
      } catch (e) {
        // TODO handle error
        alert((e as ChainError).message)
        console.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async releaseEscrow(tradeId: string) {
      this.loadingState = LoadingState.show('Funding trade...')
      try {
        await this.client.releaseEscrow(tradeId)
        await this.fetchTradeDetail(tradeId)
      } catch (e) {
        // TODO handle error
        alert((e as ChainError).message)
        console.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async refundEscrow(tradeId: string) {
      this.loadingState = LoadingState.show('Refunding trade...')
      try {
        await this.client.refundEscrow(tradeId)
        await this.fetchTradeDetail(tradeId)
      } catch (e) {
        // TODO handle error
        alert((e as ChainError).message)
        console.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async openDispute(tradeId: string, buyerContact: string, sellerContact: string) {
      this.loadingState = LoadingState.show('Opening dispute...')
      try {
        await this.client.openDispute(tradeId, buyerContact, sellerContact)
        await this.fetchTradeDetail(tradeId)
      } catch (e) {
        // TODO handle error
        alert((e as ChainError).message)
        console.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    async settleDispute(tradeId: string, winner: string) {
      this.loadingState = LoadingState.show('Settling dispute...')
      try {
        await this.client.settleDispute(tradeId, winner)
        await this.fetchTradeDetail(tradeId)
      } catch (e) {
        // TODO handle error
        alert((e as ChainError).message)
        console.error(e)
      } finally {
        this.loadingState = LoadingState.dismiss()
      }
    },
    getFiatPrice(fiatCurrency: FiatCurrency, denom: Denom): number {
      const fiatPrice = this.fiatPrices.get(fiatCurrency)?.get(denom.native) ?? 0
      try {
        return fiatPrice / 100
      } catch (e) {
        return 0
      }
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useClientStore, import.meta.hot))
}
