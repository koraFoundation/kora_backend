/**
 * BorrowService
 * @description :: Sends raw transactions for Borrow
 */

/* global sails Borrow LendService EthereumService Transactions */

module.exports = {
  sendRawCreateLoan: function ({rawCreateLoan, record}) {
    const {states, types} = Borrow.constants;

    LendService.sendRawCreateLoan({rawCreateLoan})
      .then(({receipt, event}) => {
        record.transactionHashes.push(receipt.transactionHash);
        record.loanId = event.returnValues.loanId;
        record.state = states.onGoing;
        ['to', 'guarantor1', 'guarantor2', 'guarantor3'].filter(k => record[k])
          .forEach(k => (record[k + 'Agree'] = null));

        return Borrow.update({id: record.id}, record);
      }, err => {
        record.state = states.agreed;
        record.type = types.request;

        if (err.receipt) {
          record.transactionHashes.push(err.receipt.transactionHash);
        }

        return Borrow.update({id: record.id}, record);
      })
      .then(updated => {
        // TODO: Add push here
        sails.log.info('Borrow money after KoraLend.createLoan tx saved:\n', updated[0]);
      })
      .catch(err => sails.log.error('Borrow money after KoraLend.createLoan tx save error:\n', err));
  },

  sendRawAgreeLoan: function ({rawAgreeLoan, record}) {
    const {states} = Borrow.constants;

    let guarantorIdentity;

    LendService.sendRawAgreeLoan({rawAgreeLoan})
      .then(({receipt, event}) => {
        record.transactionHashes.push(receipt.transactionHash);

        // eslint-disable-next-line eqeqeq
        if (record.loanId != event.returnValues.loanId) {
          let err = new Error('Borrow record and GuarantorAgreed event loanIds not equals');
          sails.log.error(err);
          return Promise.reject(err);
        }

        guarantorIdentity = event.returnValues.guarantor;

        return Borrow.findOnePopulate({id: record.id});
      })
      .then(populatedRecord => {
        let guarantorKey = ['guarantor1', 'guarantor2', 'guarantor3'].filter(k => record[k])
          .find(k => populatedRecord[k].identity.toLowerCase() === guarantorIdentity.toLowerCase());

        if (!guarantorKey) {
          let err = new Error(`Borrow record not has guarantor with identity equal GuarantorAgreed event guarantor`);
          sails.log.error(err);
          return Promise.reject(err);
        }

        record[guarantorKey + 'Agree'] = true;

        if (
          ['guarantor1', 'guarantor2', 'guarantor3'].filter(k => record[k])
            .every(k => record[k + 'Agree'])
        ) {
          record.state = states.agreed;
        } else {
          record.state = states.onGoing;
        }

        return Borrow.update({id: record.id}, record);
      }, err => {
        record.state = states.onGoing;

        if (err.receipt) {
          record.transactionHashes.push(err.receipt.transactionHash);
        }

        return Borrow.update({id: record.id}, record);
      })
      .then(updated => {
        // TODO: Add push here
        sails.log.info('Borrow money after KoraLend.agreeLoan tx saved:\n', updated[0]);
      })
      .catch(err => sails.log.error('Borrow money after KoraLend.agreeLoan tx save error:\n', err));
  },

  sendRawLoanTransfer: function ({rawApproves, rawFundLoan, rawPayBackLoan, record}) {
    const {states, types} = Borrow.constants;

    Promise.all(
      rawApproves.map(rawApprove =>
        EthereumService.sendSignedTransaction({rawTransaction: rawApprove, name: 'humanStandardToken.approve'})
      )
    )
      .then(receipts => {
        if (rawFundLoan) {
          return LendService.sendRawFundLoan({rawFundLoan});
        }

        if (rawPayBackLoan) {
          return LendService.sendRawPayBackLoan({rawPayBackLoan});
        }
      })
      .then(
        ({receipt, event}) => {
          record.transactionHashes.push(receipt.transactionHash);
          record.state = states.onGoing;
          record.fromBalance = event.returnValues.borrowerBalance / 100;
          record.toBalance = event.returnValues.lenderBalance / 100;

          return {
            state: Transactions.constants.states.success,
            fromValue: event.returnValues.borrowerValue / 100,
            toValue: event.returnValues.lenderValue / 100
          };
        },
        err => {
          if (rawFundLoan) {
            record.state = states.agreed;
            record.type = types.loan;
          } else if (rawPayBackLoan) {
            record.state = states.onGoing;
          }

          if (err.receipt) {
            record.transactionHashes.push(err.receipt.transactionHash);
          }

          return {
            state: Transactions.constants.states.error,
            fromValue: 0,
            toValue: 0
          };
        }
      )
      .then(({state, fromValue, toValue}) => {
        let {from, to, fromAmount, toAmount, fromBalance, additionalNote, loanId, transactionHashes} = record;

        let tx = {
          state,
          additionalNote,
          loanId,
          transactionHashes: [transactionHashes[transactionHashes.length - 1]]
        };

        if (rawFundLoan) {
          Object.assign(tx, {
            type: Transactions.constants.types.borrowFund,
            from: to,
            to: from,
            fromAmount: toAmount,
            toAmount: fromAmount
          });
        }

        if (rawPayBackLoan) {
          Object.assign(tx, {
            type: Transactions.constants.types.borrowPayBack,
            from,
            to,
            fromAmount: fromValue,
            toAmount: toValue
          });
        }

        return Transactions.create(tx)
          .then(() => {
            if (fromBalance === 0) {
              return Borrow.destroy({id: record.id});
            }

            return Borrow.update({id: record.id}, record);
          });
      })
      .then(records => {
        // TODO: Add push here
        sails.log.info(
          `Borrow money after KoraLend.${rawFundLoan ? 'fundLoan' : 'payBackLoan'} tx ${records[0].fromBalance ? 'saved' : 'destroyed'}:\n`,
          records[0]
        );
      })
      .catch(err => sails.log.error(`Borrow money after KoraLend.${rawFundLoan ? 'fundLoan' : 'payBackLoan'} tx save/destroy error:\n`, err));
  }
};